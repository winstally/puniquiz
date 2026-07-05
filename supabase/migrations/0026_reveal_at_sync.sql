-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0022_reveal_at_sync.sql : single-authority, round-trip-free drumroll reveal
-- -----------------------------------------------------------------------------
-- 0017 split the reveal into reveal_round (phase, no key) → reveal_answer (key),
-- the second step fired by the HOST's drumroll-audio `ended` event. That made the
-- answer lag the drumroll by a whole RPC round-trip, and a blocked autoplay broke
-- the timing entirely. Root cause: the timing lived in the client audio with a
-- server round-trip in between.
--
-- Fix — same model as the question timer: ONE message carries correct_key AND an
-- absolute `answer_reveal_at = now + DRUMROLL`. Every client holds the answer
-- (shows "正解は…？") until answer_reveal_at and reveals at the SAME instant — no
-- second RPC. The drumroll is purely decorative (scheduled to land on
-- answer_reveal_at). Safe to ship the key early: answering is already closed at
-- reveal, so it cannot affect scoring (only the surprise, which the client gate
-- preserves).
--
-- DRUMROLL window = 4s (keep in lockstep with DRUMROLL_MS in src/lib/reveal-timing.ts).
-- Carries forward 0021's manual-mode flat scoring. reveal_answer (0017) is left
-- in place but is no longer called by the client. Idempotent. Do NOT edit 0001–0021.
-- =============================================================================

alter table public.rounds add column if not exists answer_reveal_at timestamptz;

-- reveal_round — score (0021's manual-aware logic) + broadcast BOTH the phase and
-- the answer (correct_key) in one call, with answer_reveal_at for the client gate.
create or replace function public.reveal_round(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game     public.games;
  v_round    public.rounds;
  v_q        public.questions;
  r          record;
  v_ratio    numeric;
  v_speed    numeric;
  v_awarded  int;
  v_reveal_at timestamptz;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  update public.games set state = 'reveal', phase_deadline = null, updated_at = now()
    where id = p_game_id and state in ('question_open','locked');
  if not found then
    raise exception 'cannot reveal from state %', v_game.state;
  end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no round'; end if;
  select * into v_q from public.questions where id = v_round.question_id;

  for r in
    select a.*, p.id as pid from public.answers a
    join public.players p on p.id = a.player_id
    where a.round_id = v_round.id
  loop
    if r.choice_key = v_q.correct_key then
      if v_q.time_limit_seconds is null then
        v_awarded := v_q.points_base;                       -- manual: flat points
      else
        v_ratio   := least(greatest(r.response_ms::numeric / (v_q.time_limit_seconds * 1000), 0), 1);
        v_speed   := 1 - v_ratio / 2;                        -- instant=full, last=half
        v_awarded := least(round(v_q.points_base * v_speed)::int, v_q.points_base);
      end if;

      update public.scores set streak = streak + 1
        where game_id = p_game_id and player_id = r.pid;
      update public.scores
        set total_points  = total_points + v_awarded,
            correct_count = correct_count + 1,
            updated_at    = now()
      where game_id = p_game_id and player_id = r.pid;
      update public.answers set is_correct = true, awarded_points = v_awarded where id = r.id;
    else
      update public.scores set streak = 0, updated_at = now()
        where game_id = p_game_id and player_id = r.pid;
      update public.answers set is_correct = false, awarded_points = 0 where id = r.id;
    end if;
  end loop;

  -- The answer becomes visible (client-gated) DRUMROLL seconds from now.
  v_reveal_at := now() + interval '4 seconds';
  update public.rounds set revealed_at = now(), answer_reveal_at = v_reveal_at where id = v_round.id;

  -- phase: state→reveal (clients show "正解は…？" until answer_reveal_at).
  perform realtime.send(
    jsonb_build_object('state','reveal','position',v_game.current_position,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
  -- reveal: correct_key + final tally + leaderboard + the absolute reveal moment.
  perform realtime.send(
    jsonb_build_object(
      'correct_key', v_q.correct_key,
      'counts', (public._vote_payload(v_round.id) -> 'counts'),
      'total',  (public._vote_payload(v_round.id) -> 'total'),
      'correct_count', (select count(*)::int from public.answers where round_id = v_round.id and is_correct),
      'leaderboard', public._leaderboard(p_game_id),
      'answer_reveal_at', v_reveal_at,
      'server_now', now()),
    'reveal', 'game:'||p_game_id::text, true);
end;
$$;

-- get_game_snapshot — return correct_key + correct_count post-reveal (revealed_at
-- not null) PLUS answer_reveal_at; the client holds display until that moment, so
-- a reconnect during the 溜め still shows "正解は…？" then reveals on time.
create or replace function public.get_game_snapshot(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_game   public.games;
  v_round  public.rounds;
  v_me     uuid;
  v_my     jsonb := null;
  v_question jsonb := null;
  v_correct text := null;
  v_revealed boolean := false;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if not public.is_game_member(p_game_id) then raise exception 'not a member'; end if;

  if v_game.state <> 'lobby' then
    v_question := public._question_public(v_game.quiz_id, v_game.current_position);
    select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
    v_revealed := v_round.id is not null and v_round.revealed_at is not null;
    if v_revealed then
      select correct_key into v_correct from public.questions where id = v_round.question_id;
    end if;
  end if;

  select id into v_me from public.players where game_id = p_game_id and user_id = v_uid;
  if v_me is not null and v_round.id is not null then
    select jsonb_build_object(
      'choice_key', a.choice_key,
      'is_correct', case when v_revealed then a.is_correct else null end,
      'awarded_points', case when v_revealed then a.awarded_points else null end
    ) into v_my
    from public.answers a where a.round_id = v_round.id and a.player_id = v_me;
  end if;

  return jsonb_build_object(
    'state', v_game.state,
    'current_position', v_game.current_position,
    'current_question', v_question,
    'phase_deadline', v_game.phase_deadline,
    'answers_open_at', v_round.answers_open_at,
    'server_now', now(),
    'registration_locked', v_game.registration_locked,
    'has_next', (v_game.next_quiz_id is not null),
    'is_demo', coalesce((select is_demo from public.quizzes where id = v_game.quiz_id), false),
    'correct_key', v_correct,
    'answer_reveal_at', v_round.answer_reveal_at,
    'correct_count', case
      when v_revealed
      then (select count(*)::int from public.answers where round_id = v_round.id and is_correct)
      else 0 end,
    'my_answer', v_my,
    'vote', case when v_round.id is not null then public._vote_payload(v_round.id) else null end,
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', p.id, 'nickname', p.nickname,
        'avatar_color', p.avatar_color, 'avatar_initial', p.avatar_initial,
        'is_connected', p.is_connected))
      from public.players p where p.game_id = p_game_id), '[]'::jsonb),
    'leaderboard', public._leaderboard(p_game_id)
  );
end;
$fn$;

-- end 0022_reveal_at_sync.sql

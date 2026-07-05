-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0017_server_reveal_drumroll.sql : server-authoritative drumroll "溜め"
-- -----------------------------------------------------------------------------
-- The reveal is split into TWO server steps so the correct answer is NEVER on the
-- client during the drumroll suspense (no more client-side setTimeout hiding it):
--   • reveal_round  — score + state='reveal' + the 'phase' broadcast only
--                     (NO correct_key). Clients show "正解は…？".
--   • reveal_answer — released when the host's drumroll ends: the 'reveal'
--                     broadcast that carries correct_key. Sets answer_revealed_at,
--                     which also gates get_game_snapshot (reconnect-safe).
-- Idempotent. Do NOT edit 0001–0016.
-- =============================================================================

alter table public.rounds add column if not exists answer_revealed_at timestamptz;

-- reveal_round — identical to 0014 except the correct_key ('reveal') broadcast is
-- moved to reveal_answer. Scoring still happens here; the answer is just withheld.
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
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  -- Atomically claim the reveal so a concurrent host/tick call can't double-score.
  update public.games set state = 'reveal', phase_deadline = null, updated_at = now()
    where id = p_game_id and state in ('question_open','locked');
  if not found then
    raise exception 'cannot reveal from state %', v_game.state;
  end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no round'; end if;
  select * into v_q from public.questions where id = v_round.question_id;

  -- score each answer + upsert scores (this question's points_base × speed)
  for r in
    select a.*, p.id as pid from public.answers a
    join public.players p on p.id = a.player_id
    where a.round_id = v_round.id
  loop
    if r.choice_key = v_q.correct_key then
      v_ratio   := least(greatest(r.response_ms::numeric / (v_q.time_limit_seconds * 1000), 0), 1);
      v_speed   := 1 - v_ratio / 2;                         -- instant=full, last=half
      v_awarded := least(round(v_q.points_base * v_speed)::int, v_q.points_base);

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

  -- revealed_at = scored; answer_revealed_at stays null until the drumroll ends.
  update public.rounds set revealed_at = now(), answer_revealed_at = null where id = v_round.id;

  -- phase only — the correct_key is withheld during the drumroll 溜め.
  perform realtime.send(
    jsonb_build_object('state','reveal','position',v_game.current_position,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
end;
$$;

-- reveal_answer — release the answer when the host's drumroll lands. Carries
-- correct_key + final vote tally + leaderboard (the old reveal_round payload).
-- Idempotent: only the first call (answer_revealed_at still null) broadcasts.
create or replace function public.reveal_answer(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   public.games;
  v_round  public.rounds;
  v_q      public.questions;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  if v_game.state <> 'reveal' then raise exception 'cannot release answer from state %', v_game.state; end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no round'; end if;
  if v_round.answer_revealed_at is not null then return; end if;  -- already released

  update public.rounds set answer_revealed_at = now() where id = v_round.id;
  select * into v_q from public.questions where id = v_round.question_id;

  -- reveal broadcast: the ONLY message that carries correct_key
  perform realtime.send(
    jsonb_build_object(
      'correct_key', v_q.correct_key,
      'counts', (public._vote_payload(v_round.id) -> 'counts'),
      'total',  (public._vote_payload(v_round.id) -> 'total'),
      'correct_count', (select count(*)::int from public.answers where round_id = v_round.id and is_correct),
      'leaderboard', public._leaderboard(p_game_id)),
    'reveal', 'game:'||p_game_id::text, true);
end;
$$;

revoke all on function public.reveal_answer(uuid, uuid) from public;
grant execute on function public.reveal_answer(uuid, uuid) to authenticated;

-- get_game_snapshot — same as 0013, but the answer (correct_key / is_correct /
-- awarded_points) is gated on answer_revealed_at (drumroll release) instead of
-- revealed_at, so a reconnect DURING the 溜め still hides the answer.
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
  v_q      public.questions;
  v_me     uuid;
  v_my     jsonb := null;
  v_question jsonb := null;
  v_correct text := null;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if not public.is_game_member(p_game_id) then raise exception 'not a member'; end if;

  if v_game.state <> 'lobby' then
    v_question := public._question_public(v_game.quiz_id, v_game.current_position);
    select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
    if v_round.id is not null and v_round.answer_revealed_at is not null then
      select correct_key into v_correct from public.questions where id = v_round.question_id;
    end if;
  end if;

  select id into v_me from public.players where game_id = p_game_id and user_id = v_uid;
  if v_me is not null and v_round.id is not null then
    select jsonb_build_object(
      'choice_key', a.choice_key,
      'is_correct', case when v_round.answer_revealed_at is not null then a.is_correct else null end,
      'awarded_points', case when v_round.answer_revealed_at is not null then a.awarded_points else null end
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

-- end 0017_server_reveal_drumroll.sql

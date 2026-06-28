-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0007_question_lead.sql : Kahoot-style countdown + question-reading lead
-- -----------------------------------------------------------------------------
-- Before this, a question opened and its choices were answerable immediately.
-- Now each question has a server-authoritative LEAD before answering:
--     opened_at ──3s countdown──┐──5s read question──┐── answer window ──┐
--                          answers_open_at        (answers_open_at)   deadline
-- where the answer window = the question's time_limit_seconds.
--
--   * rounds.answers_open_at : when choices unlock / the answer timer starts.
--   * host_advance : opened_at=now, answers_open_at=now+8s (3+5),
--                    deadline=answers_open_at+time_limit. Broadcasts answers_open_at.
--   * submit_answer : rejects presses while now() < answers_open_at; speed score
--                     (response_ms) is measured from answers_open_at (lead excluded).
--   * get_game_snapshot : returns answers_open_at so reconnect/late-join sync.
--   * tick / reveal_round : unchanged (still fire on `deadline`).
--
-- Lead = 8s (3 countdown + 5 reading). Change here to retune.
-- Idempotent (create or replace; add column if not exists). Do NOT edit 0001–0006.
-- =============================================================================

alter table public.rounds
  add column if not exists answers_open_at timestamptz;

-- host_advance — opens a question with the countdown/reading lead -------------
create or replace function public.host_advance(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_game         public.games;
  v_next_pos     int;
  v_q            public.questions;
  v_round        public.rounds;
  v_deadline     timestamptz;
  v_answers_open timestamptz;
  v_total        int;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;

  select count(*) into v_total from public.questions where quiz_id = v_game.quiz_id;

  if v_game.state in ('lobby','scoreboard') then
    if v_game.state = 'lobby' then
      v_next_pos := 0;
    else
      v_next_pos := v_game.current_position + 1;
    end if;

    if v_next_pos >= v_total then
      update public.games set state = 'ended', phase_deadline = null, updated_at = now()
      where id = p_game_id;
      perform realtime.send(
        jsonb_build_object('state','ended','deadline',null,'server_now',now()),
        'phase', 'game:'||p_game_id::text, true);
      return;
    end if;

    select * into v_q from public.questions where quiz_id = v_game.quiz_id and position = v_next_pos;
    -- 3s countdown + 5s question-reading lead, THEN the answer window.
    v_answers_open := now() + interval '8 seconds';
    v_deadline := v_answers_open + make_interval(secs => v_q.time_limit_seconds);

    insert into public.rounds (game_id, question_id, position, opened_at, deadline, answers_open_at)
    values (p_game_id, v_q.id, v_next_pos, now(), v_deadline, v_answers_open)
    on conflict (game_id, position) do update
      set deadline = excluded.deadline, opened_at = now(),
          answers_open_at = excluded.answers_open_at, revealed_at = null
    returning * into v_round;

    update public.games
      set state = 'question_open', current_position = v_next_pos,
          phase_started_at = now(), phase_deadline = v_deadline, updated_at = now()
    where id = p_game_id;

    perform realtime.send(
      jsonb_build_object(
        'state','question_open','position',v_next_pos,
        'deadline',v_deadline,'answers_open_at',v_answers_open,'server_now',now()),
      'phase', 'game:'||p_game_id::text, true);
    perform realtime.send(
      public._question_public(v_game.quiz_id, v_next_pos),
      'question', 'game:'||p_game_id::text, true);

  elsif v_game.state = 'question_open' then
    update public.games set state = 'locked', updated_at = now() where id = p_game_id;
    perform realtime.send(
      jsonb_build_object('state','locked','position',v_game.current_position,'server_now',now()),
      'phase', 'game:'||p_game_id::text, true);

  elsif v_game.state = 'reveal' then
    update public.games set state = 'scoreboard', phase_deadline = null, updated_at = now()
    where id = p_game_id;
    perform realtime.send(
      jsonb_build_object('state','scoreboard','position',v_game.current_position,'deadline',null,'server_now',now()),
      'phase', 'game:'||p_game_id::text, true);
    perform realtime.send(
      jsonb_build_object('leaderboard', public._leaderboard(p_game_id)),
      'scoreboard', 'game:'||p_game_id::text, true);
  else
    raise exception 'cannot advance from state %', v_game.state;
  end if;
end;
$fn$;

-- submit_answer — reject during the lead; score speed from answers_open_at ----
create or replace function public.submit_answer(p_game_id uuid, p_choice_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_game      public.games;
  v_player_id uuid;
  v_round     public.rounds;
  v_resp_ms   int;
  v_inserted  boolean := false;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.state <> 'question_open' then
    raise exception 'not accepting answers';
  end if;

  select id into v_player_id from public.players where game_id = p_game_id and user_id = v_uid;
  if v_player_id is null then raise exception 'not a player'; end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no open round'; end if;
  -- Lead guard: choices aren't answerable until answers_open_at (server truth).
  if v_round.answers_open_at is not null and now() < v_round.answers_open_at then
    raise exception 'answers not open yet';
  end if;
  if now() > v_round.deadline then raise exception 'deadline passed'; end if;

  -- Speed measured from answers_open_at (the lead time is not answering time).
  v_resp_ms := greatest(0, (extract(epoch from (now() - coalesce(v_round.answers_open_at, v_round.opened_at))) * 1000)::int);

  begin
    insert into public.answers (round_id, player_id, choice_key, answered_at, response_ms)
    values (v_round.id, v_player_id, p_choice_key, now(), v_resp_ms);
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false;
  end;

  if v_inserted then
    perform realtime.send(
      public._vote_payload(v_round.id),
      'vote', 'game:'||p_game_id::text, true);
  end if;

  return jsonb_build_object('accepted', v_inserted, 'choice_key', p_choice_key, 'response_ms', v_resp_ms);
end;
$fn$;

-- get_game_snapshot — same as 0004 plus answers_open_at ----------------------
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
    if v_round.id is not null and v_round.revealed_at is not null then
      select correct_key into v_correct from public.questions where id = v_round.question_id;
    end if;
  end if;

  select id into v_me from public.players where game_id = p_game_id and user_id = v_uid;
  if v_me is not null and v_round.id is not null then
    select jsonb_build_object(
      'choice_key', a.choice_key,
      'is_correct', case when v_round.revealed_at is not null then a.is_correct else null end,
      'awarded_points', case when v_round.revealed_at is not null then a.awarded_points else null end
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

-- end 0007_question_lead.sql

-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0015_host_open_answers.sql : host explicitly opens the answer phase
-- -----------------------------------------------------------------------------
-- 0007 opened a question with a fixed 8s lead (3s countdown + 5s reading) that
-- auto-advanced into the answer window. The host had no control over how long
-- the question stayed up to be read aloud. Now:
--
--   host_advance (open)  → question_open, answers_open_at = NULL, deadline = NULL
--                          → the question is shown and PARKED ("await": host reads
--                            it aloud; players wait). No timer is running.
--   host_open_answers    → host's go: answers_open_at = now()+3s (a 3-2-1 ready
--                          countdown), deadline = answers_open_at + time_limit.
--                          The answer window then runs as before.
--
-- The 5s reading window is gone; the countdown is now a fair "ready, 3-2-1" that
-- fires only on the host's signal.
--
-- Changes (all idempotent; do NOT edit 0001–0014):
--   * rounds.deadline      → nullable (unknown until the host opens answers)
--   * host_advance         → open branch parks the question (NULL lead)
--   * host_open_answers     → NEW: starts the 3s countdown + answer window
--   * submit_answer        → reject while answers_open_at IS NULL (await), too
-- =============================================================================

-- deadline is unknown until the host opens answers.
alter table public.rounds alter column deadline drop not null;

-- host_advance — open parks the question; lock / scoreboard branches unchanged --
create or replace function public.host_advance(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_game     public.games;
  v_next_pos int;
  v_q        public.questions;
  v_round    public.rounds;
  v_total    int;
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

    -- Park the question: no timer until the host opens answers (await phase).
    insert into public.rounds (game_id, question_id, position, opened_at, deadline, answers_open_at)
    values (p_game_id, v_q.id, v_next_pos, now(), null, null)
    on conflict (game_id, position) do update
      set deadline = null, opened_at = now(),
          answers_open_at = null, revealed_at = null
    returning * into v_round;

    update public.games
      set state = 'question_open', current_position = v_next_pos,
          phase_started_at = now(), phase_deadline = null, updated_at = now()
    where id = p_game_id;

    perform realtime.send(
      jsonb_build_object(
        'state','question_open','position',v_next_pos,
        'deadline',null,'answers_open_at',null,'server_now',now()),
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

-- host_open_answers — host's go: 3s countdown, then the answer window ----------
create or replace function public.host_open_answers(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_game         public.games;
  v_round        public.rounds;
  v_q            public.questions;
  v_answers_open timestamptz;
  v_deadline     timestamptz;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  if v_game.state <> 'question_open' then
    raise exception 'not in a question';
  end if;

  select * into v_round from public.rounds where game_id = p_game_id and position = v_game.current_position;
  if v_round.id is null then raise exception 'no round'; end if;
  -- Idempotent guard: only the first call arms the countdown.
  if v_round.answers_open_at is not null then
    raise exception 'answers already opening';
  end if;

  select * into v_q from public.questions where id = v_round.question_id;

  -- 3-2-1 "ready" countdown, then the answer window of time_limit_seconds.
  v_answers_open := now() + interval '3 seconds';
  v_deadline     := v_answers_open + make_interval(secs => v_q.time_limit_seconds);

  update public.rounds set answers_open_at = v_answers_open, deadline = v_deadline
    where id = v_round.id;
  update public.games
    set phase_started_at = now(), phase_deadline = v_deadline, updated_at = now()
    where id = p_game_id;

  perform realtime.send(
    jsonb_build_object(
      'state','question_open','position',v_game.current_position,
      'deadline',v_deadline,'answers_open_at',v_answers_open,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
end;
$fn$;

-- submit_answer — also reject while answers haven't been opened (await) --------
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
  -- Lead guard: not answerable until the host opens answers AND the countdown
  -- has elapsed (answers_open_at is NULL during the await phase).
  if v_round.answers_open_at is null or now() < v_round.answers_open_at then
    raise exception 'answers not open yet';
  end if;
  if v_round.deadline is not null and now() > v_round.deadline then
    raise exception 'deadline passed';
  end if;

  -- Speed measured from answers_open_at (the lead time is not answering time).
  v_resp_ms := greatest(0, (extract(epoch from (now() - v_round.answers_open_at)) * 1000)::int);

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

-- end 0015_host_open_answers.sql

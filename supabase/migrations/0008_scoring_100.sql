-- 0005_scoring_100.sql
-- New scoring: every quiz is out of 100 points total, split evenly across its
-- questions (leftover points go to the earliest questions so a perfect, instant
-- run sums to EXACTLY 100 for any number of questions). Each correct answer earns
-- its question's share weighted by speed (instant = full, last-moment = half).
-- The old configurable `points_base` and the streak bonus are no longer used —
-- score depends only on (which questions you get right) × (how fast).
--
-- Only reveal_round changes; the questions.points_base column is left in place
-- (vestigial) to keep this migration a pure function replacement.

create or replace function public.reveal_round(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game        public.games;
  v_round       public.rounds;
  v_q           public.questions;
  r             record;
  v_ratio       numeric;
  v_speed       numeric;
  v_awarded     int;
  v_qcount      int;
  v_base        int;
  v_rem         int;
  v_rank        int;
  v_per_max     int;
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

  -- This question's share of the 100-point total. Even split; the first `v_rem`
  -- questions (by position) get +1 so the shares sum to exactly 100.
  select count(*) into v_qcount from public.questions where quiz_id = v_game.quiz_id;
  if v_qcount < 1 then v_qcount := 1; end if;
  v_base := 100 / v_qcount;
  v_rem  := 100 - v_base * v_qcount;
  select count(*) into v_rank from public.questions
    where quiz_id = v_game.quiz_id and position < v_q.position;  -- 0-based rank
  v_per_max := v_base + (case when v_rank < v_rem then 1 else 0 end);

  -- score each answer + upsert scores (speed-weighted share of 100)
  for r in
    select a.*, p.id as pid from public.answers a
    join public.players p on p.id = a.player_id
    where a.round_id = v_round.id
  loop
    if r.choice_key = v_q.correct_key then
      v_ratio   := least(greatest(r.response_ms::numeric / (v_q.time_limit_seconds * 1000), 0), 1);
      v_speed   := 1 - v_ratio / 2;                         -- instant=full, last=half
      v_awarded := least(round(v_per_max * v_speed)::int, v_per_max);

      -- streak is still tracked (for display) but no longer affects the score
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

  update public.rounds set revealed_at = now() where id = v_round.id;

  -- reveal broadcast: the ONLY message that carries correct_key
  perform realtime.send(
    jsonb_build_object('state','reveal','position',v_game.current_position,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
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

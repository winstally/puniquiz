-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0014_configurable_points.sql : host-configurable per-question points
-- -----------------------------------------------------------------------------
-- 0005 replaced the original per-question scoring with an even split of a fixed
-- 100-point total. That made `questions.points_base` (the per-question max the
-- editor already stores, default 1000) dead, so a host could never weight a hard
-- question more — and the question screen had no point value to show.
--
-- This reverts scoring to the ORIGINAL model (see 0001): each correct answer
-- earns its question's `points_base`, weighted by speed (instant = full,
-- last-moment = half). points_base is now the single source of truth for a
-- question's worth, set per question in the editor.
--
--   awarded = round(points_base * (1 - ratio/2)),  ratio = response_ms / limit_ms
--
-- Two function replacements, both idempotent. Do NOT edit 0001–0013.
--   (1) reveal_round   — score by points_base * speed (was even-split-100)
--   (2) _question_public — expose points_base so the live screens can show it
-- =============================================================================

-- (1) scoring: per-question points_base, speed-weighted -----------------------
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

-- (2) public question payload: expose points_base (the question's worth) -------
-- Used by get_game_snapshot (reload recovery) and the round-advance broadcast,
-- so the live host + player screens can show "この問題 N pt". Never leaks
-- correct_key. Same shape as 0007 plus points_base.
create or replace function public._question_public(p_quiz_id uuid, p_position int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(t) from (
    select q.position, q.eyebrow, q.text, q.choices, q.time_limit_seconds, q.points_base, q.media_url
    from public.questions q
    where q.quiz_id = p_quiz_id and q.position = p_position
  ) t;
$$;

-- end 0014_configurable_points.sql

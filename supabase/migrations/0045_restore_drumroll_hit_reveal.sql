-- 0045_restore_drumroll_hit_reveal.sql
--
-- Regression fix: 0043/0044 rebuilt reveal_round from the pre-0039 body and
-- silently reverted answer_reveal_at to now()+4s. 0039's contract is that the
-- prompt and drumroll start together and the answer lands ON the source's
-- "じゃん!" hit (~2.54s — see src/lib/reveal-timing.ts DRUMROLL_HIT_MS).
-- This is 0044's reveal_round with only the interval restored.

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
  v_allowed  boolean;
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

  select coalesce(answer_change_allowed, false) into v_allowed
  from public.quizzes where id = v_game.quiz_id;

  for r in
    select a.*, p.id as pid from public.answers a
    join public.players p on p.id = a.player_id
    where a.round_id = v_round.id
  loop
    if r.choice_key = v_q.correct_key then
      if v_q.time_limit_seconds is null or v_allowed then
        v_awarded := v_q.points_base;
      else
        v_ratio   := least(greatest(r.response_ms::numeric / (v_q.time_limit_seconds * 1000), 0), 1);
        v_speed   := 1 - v_ratio / 2;
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

  -- The drumroll's "じゃん!" hit — keep in lockstep with DRUMROLL_HIT_MS (2540ms).
  v_reveal_at := now() + interval '2.54 seconds';
  update public.rounds set revealed_at = now(), answer_reveal_at = v_reveal_at where id = v_round.id;

  perform realtime.send(
    jsonb_build_object('state','reveal','position',v_game.current_position,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
  perform realtime.send(
    jsonb_build_object(
      'correct_key', v_q.correct_key,
      'counts', (public._vote_payload(v_round.id) -> 'counts'),
      'total',  (public._vote_payload(v_round.id) -> 'total'),
      'correct_count', (select count(*)::int from public.answers where round_id = v_round.id and is_correct),
      'leaderboard', public._leaderboard(p_game_id),
      'score_max_points', public._quiz_score_max_points(v_game.quiz_id, v_game.current_position, false),
      'answer_reveal_at', v_reveal_at,
      'server_now', now()),
    'reveal', 'game:'||p_game_id::text, true);
end;
$$;

notify pgrst, 'reload schema';

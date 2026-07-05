-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0020_skip_final_scoreboard.sql : no interim scoreboard after the LAST question
-- -----------------------------------------------------------------------------
-- Bug: after the last question's reveal, advancing showed the interim scoreboard
-- ("現在のランキング") and then 次へ showed the SAME leaderboard again on the
-- ended screen — the final ranking appeared twice.
--
-- Fix: in host_advance's reveal branch, if the current question is the last one
-- (current_position + 1 >= question count) go straight to 'ended'. The interim
-- scoreboard still appears BETWEEN questions; it's only skipped at the very end.
--
-- Identical to 0015_host_open_answers' host_advance except the reveal branch.
-- Idempotent. Do NOT edit 0001–0019.
-- =============================================================================

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
    -- After the LAST question, skip the interim scoreboard and go straight to the
    -- final ranking (ended) — otherwise the same leaderboard shows twice. Between
    -- questions (not the last), the scoreboard still appears as before.
    if v_game.current_position + 1 >= v_total then
      update public.games set state = 'ended', phase_deadline = null, updated_at = now()
      where id = p_game_id;
      perform realtime.send(
        jsonb_build_object('state','ended','deadline',null,'server_now',now()),
        'phase', 'game:'||p_game_id::text, true);
    else
      update public.games set state = 'scoreboard', phase_deadline = null, updated_at = now()
      where id = p_game_id;
      perform realtime.send(
        jsonb_build_object('state','scoreboard','position',v_game.current_position,'deadline',null,'server_now',now()),
        'phase', 'game:'||p_game_id::text, true);
      perform realtime.send(
        jsonb_build_object('leaderboard', public._leaderboard(p_game_id)),
        'scoreboard', 'game:'||p_game_id::text, true);
    end if;
  else
    raise exception 'cannot advance from state %', v_game.state;
  end if;
end;
$fn$;

-- end 0020_skip_final_scoreboard.sql

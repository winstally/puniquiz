-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0011_demo_at_lobby.sql : "start with the demo" from the LOBBY (not at create)
-- -----------------------------------------------------------------------------
-- The demo warm-up is now chosen on the lobby screen, AFTER players have gathered
-- and registration is closed — not at game-creation time. This RPC prepends the
-- curated demo to an existing lobby game and opens its first question:
--
--   * requires the game to be in 'lobby' with no quiz already queued,
--   * stashes the real quiz into next_quiz_id, swaps quiz_id -> demo,
--   * then reuses host_advance to open the demo's first question.
--
-- When the demo ends, advance_quiz (0010) continues the SAME game (same PIN /
-- players) with the real quiz. No demo special-casing beyond this entry point.
--
-- Idempotent (create or replace). Do NOT edit 0001–0010.
-- =============================================================================

create or replace function public.host_start_demo(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_game public.games;
  v_demo uuid;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  if v_game.state <> 'lobby' then raise exception 'can only start from the lobby'; end if;
  if v_game.next_quiz_id is not null then raise exception 'a quiz is already queued'; end if;

  select id into v_demo
    from public.quizzes
    where is_demo and is_published
    order by created_at
    limit 1;
  if v_demo is null then raise exception 'no demo quiz available'; end if;
  if v_demo = v_game.quiz_id then raise exception 'already on the demo'; end if;

  -- Stash the real quiz as the continuation, swap the demo in to play first.
  update public.games
    set next_quiz_id = quiz_id,
        quiz_id      = v_demo,
        updated_at   = now()
  where id = p_game_id;

  -- Reuse the normal lobby → first-question transition (countdown + broadcasts).
  perform public.host_advance(p_game_id, p_host_secret);
end;
$fn$;

-- end 0011_demo_at_lobby.sql

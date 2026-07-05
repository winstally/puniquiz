-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0013_snapshot_is_demo.sql : expose is_demo on the game snapshot (SSOT)
-- -----------------------------------------------------------------------------
-- Whether a live game is currently running the curated DEMO quiz is server truth
-- (quizzes.is_demo of the game's current quiz_id), not a URL flag. get_game_snapshot
-- now returns `is_demo` so the host UI can hide "デモから始める" on a demo game
-- without any client-side guessing — and it stays correct across reload / share /
-- quiz-chain advance (quiz_id changes → is_demo re-derives).
--
-- Same as 0010 plus the is_demo field. Idempotent. Do NOT edit 0001–0012.
-- =============================================================================

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

-- end 0013_snapshot_is_demo.sql

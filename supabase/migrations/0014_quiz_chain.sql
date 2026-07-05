-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0010_quiz_chain.sql : generic quiz chaining (a game can run a NEXT quiz)
-- -----------------------------------------------------------------------------
-- A game may carry an optional `next_quiz_id`. When the current quiz ENDS, the
-- host can continue the SAME game (same PIN, same players) with that next quiz:
-- this quiz's rounds/answers/scores are wiped, `quiz_id` is swapped to the next
-- quiz, and the game returns to the lobby ready to start fresh.
--
-- "Play a demo first" is just this, with no special-casing: create the game with
-- quiz_id = <demo>, next_quiz_id = <real quiz>. The demo is chain position 0.
--
--   * games.next_quiz_id : the quiz to continue with after this one ends.
--   * create_game        : now takes an optional p_next_quiz_id.
--   * advance_quiz       : ended + next queued → swap quiz, reset, → lobby.
--   * get_game_snapshot  : exposes has_next so the ended screen shows "本番に進む".
--   * host_advance / reveal_round / submit_answer : UNCHANGED — they read the
--     game's current quiz_id, which now simply points at the swapped-in quiz.
--
-- Idempotent (create or replace; add column if not exists). Do NOT edit 0001–0009.
-- =============================================================================

alter table public.games
  add column if not exists next_quiz_id uuid references public.quizzes(id) on delete set null;

-- create_game — optionally queue a next quiz to chain after this one ----------
-- The 1-arg version is dropped first: keeping both would make create_game(uuid)
-- ambiguous against the new default-valued 2-arg overload. Existing callers pass
-- the named p_quiz_id only and resolve to this version (p_next_quiz_id => null).
drop function if exists public.create_game(uuid);
create or replace function public.create_game(p_quiz_id uuid, p_next_quiz_id uuid default null)
returns table (game_id uuid, pin text, host_secret uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_pin    text;
  v_game   public.games;
  v_tries  int := 0;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  -- Host a published quiz (link-quiz: ownerless+published) OR one you own.
  if not exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id and (q.is_published or q.owner_id = v_uid)
  ) then
    raise exception 'cannot host this quiz';
  end if;
  -- The chained quiz (if any) must be hostable too.
  if p_next_quiz_id is not null and not exists (
    select 1 from public.quizzes q
    where q.id = p_next_quiz_id and (q.is_published or q.owner_id = v_uid)
  ) then
    raise exception 'cannot host the next quiz';
  end if;

  -- Generate a unique 6-digit PIN among non-ended games.
  loop
    v_tries := v_tries + 1;
    v_pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.games (quiz_id, next_quiz_id, pin, host_id, state, current_position)
      values (p_quiz_id, p_next_quiz_id, v_pin, v_uid, 'lobby', 0)
      returning * into v_game;
      exit;
    exception when unique_violation then
      if v_tries > 20 then raise exception 'could not allocate pin'; end if;
    end;
  end loop;

  return query select v_game.id, v_game.pin, v_game.host_secret;
end;
$$;

-- advance_quiz — continue the SAME game with the queued next quiz -------------
-- Only valid once the current quiz has ENDED and a next quiz is queued. Wipes
-- the finished quiz's play data (rounds cascade to answers; scores explicitly),
-- swaps in the next quiz, clears the queue, and returns to the lobby. Players
-- (the roster) are untouched: same session, same people, fresh quiz.
create or replace function public.advance_quiz(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;
  if v_game.next_quiz_id is null then raise exception 'no next quiz queued'; end if;
  if v_game.state <> 'ended' then
    raise exception 'can only continue after the quiz has ended';
  end if;

  -- Reset all play data so the next quiz starts from a clean slate.
  delete from public.rounds where game_id = p_game_id;   -- answers cascade
  delete from public.scores where game_id = p_game_id;

  update public.games
    set quiz_id          = v_game.next_quiz_id,
        next_quiz_id     = null,
        state            = 'lobby',
        current_position = 0,
        phase_started_at = null,
        phase_deadline   = null,
        updated_at       = now()
  where id = p_game_id;

  -- Everyone returns to the lobby for the next quiz.
  perform realtime.send(
    jsonb_build_object('state','lobby','server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
end;
$fn$;

-- get_game_snapshot — same as 0007 plus has_next (is a next quiz queued?) -----
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

-- end 0010_quiz_chain.sql

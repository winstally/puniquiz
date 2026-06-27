-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0004_lobby_controls.sql : registration lock + player leave + host reset-to-lobby
-- -----------------------------------------------------------------------------
-- Adds host/player flow controls requested for the lobby:
--   (1) registration lock — host can temporarily stop new players joining, then
--       reopen. join_game honours it (existing players may still reconnect).
--   (2) leave_game        — a player fully cancels participation; their row is
--       deleted (answers + scores cascade via FK on delete cascade).
--   (3) host_reset_to_lobby — host aborts an in-flight game back to the lobby
--       (clears rounds/answers, zeroes scores; keeps players, pin, lock).
--
-- All authority stays in SECURITY DEFINER RPCs guarded by auth.uid()/host_secret,
-- consistent with 0001/0002. New functions are revoked from public/anon and
-- granted only to `authenticated` (mirrors 0002's hardening). create-or-replace
-- of join_game / get_game_snapshot preserves their existing grants.
--
-- Idempotent: add column if not exists; create or replace; repeatable grants.
-- Do NOT edit 0001–0003. Safe to run on the already-migrated DB.
-- =============================================================================

-- (1) registration lock column ------------------------------------------------
alter table public.games
  add column if not exists registration_locked boolean not null default false;

-- =============================================================================
-- join_game — same as 0001, plus a registration-lock gate. Existing players may
-- still re-join (reconnect) while locked, so a lock never strands someone in.
-- =============================================================================
create or replace function public.join_game(
  p_pin text,
  p_nickname text,
  p_avatar_color text default null,
  p_avatar_initial text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_game    public.games;
  v_player_id uuid;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;

  select * into v_game from public.games
  where pin = p_pin and state <> 'ended'
  limit 1;
  if v_game.id is null then
    raise exception 'game not found';
  end if;

  -- Registration lock: block NEW joiners; already-joined users may reconnect.
  if v_game.registration_locked
     and not exists (
       select 1 from public.players p
       where p.game_id = v_game.id and p.user_id = v_uid
     ) then
    raise exception 'registration locked';
  end if;

  insert into public.players (game_id, user_id, nickname, avatar_color, avatar_initial, is_connected, last_seen_at)
  values (v_game.id, v_uid, p_nickname, p_avatar_color, p_avatar_initial, true, now())
  on conflict (game_id, user_id) do update
    set nickname     = excluded.nickname,
        avatar_color = coalesce(excluded.avatar_color, public.players.avatar_color),
        avatar_initial = coalesce(excluded.avatar_initial, public.players.avatar_initial),
        is_connected = true,
        last_seen_at = now()
  returning id into v_player_id;

  -- ensure a scores row exists for the leaderboard
  insert into public.scores (game_id, player_id) values (v_game.id, v_player_id)
  on conflict (game_id, player_id) do nothing;

  return v_player_id;
end;
$$;

-- =============================================================================
-- set_registration_lock(game_id, host_secret, locked) -> void
-- Host toggles whether new players may join. Broadcasts the lock so member
-- clients can reflect a "受付停止中" state.
-- =============================================================================
create or replace function public.set_registration_lock(
  p_game_id uuid,
  p_host_secret uuid,
  p_locked boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;

  update public.games set registration_locked = p_locked, updated_at = now()
  where id = p_game_id;

  perform realtime.send(
    jsonb_build_object('registration_locked', p_locked, 'server_now', now()),
    'lock', 'game:'||p_game_id::text, true);
end;
$$;

-- =============================================================================
-- leave_game(game_id) -> void
-- A player cancels participation. Deletes the caller's own player row; their
-- answers + scores cascade away (FK on delete cascade). Idempotent (no row = no-op).
-- =============================================================================
create or replace function public.leave_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth required'; end if;
  delete from public.players where game_id = p_game_id and user_id = v_uid;
end;
$$;

-- =============================================================================
-- host_reset_to_lobby(game_id, host_secret) -> void
-- Host aborts an in-flight game back to the lobby: clears rounds (answers cascade)
-- and zeroes scores, then sets state='lobby'. Keeps players, pin, and the lock.
-- =============================================================================
create or replace function public.host_reset_to_lobby(p_game_id uuid, p_host_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then raise exception 'game not found'; end if;
  if v_game.host_secret <> p_host_secret then raise exception 'not host'; end if;

  delete from public.rounds where game_id = p_game_id;             -- answers cascade
  update public.scores set total_points = 0, correct_count = 0, streak = 0, updated_at = now()
    where game_id = p_game_id;

  update public.games
    set state = 'lobby', current_position = 0,
        phase_deadline = null, phase_started_at = null, updated_at = now()
  where id = p_game_id;

  perform realtime.send(
    jsonb_build_object('state','lobby','position',0,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
end;
$$;

-- =============================================================================
-- get_game_snapshot — same as 0001, plus registration_locked so a host reload /
-- late join reflects the current lock state.
-- =============================================================================
create or replace function public.get_game_snapshot(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

-- =============================================================================
-- GRANTS — new client-called RPCs to authenticated only (revoke public/anon).
-- join_game / get_game_snapshot keep their 0001/0002 grants across replace.
-- =============================================================================
revoke execute on function public.set_registration_lock(uuid, uuid, boolean) from public, anon;
revoke execute on function public.leave_game(uuid)                            from public, anon;
revoke execute on function public.host_reset_to_lobby(uuid, uuid)             from public, anon;

grant  execute on function public.set_registration_lock(uuid, uuid, boolean)  to authenticated;
grant  execute on function public.leave_game(uuid)                            to authenticated;
grant  execute on function public.host_reset_to_lobby(uuid, uuid)             to authenticated;

-- end 0004_lobby_controls.sql

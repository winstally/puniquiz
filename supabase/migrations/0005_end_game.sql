-- 0005_end_game.sql
--
-- end_game — the host aborts the whole session. Sets state to 'ended' and
-- broadcasts it, so every participant's screen moves to the end state at once
-- (the host-scoped, game-wide counterpart of the player's leave_game). The host
-- then returns to the landing page. host_secret-gated, like the other host RPCs.
create or replace function public.end_game(p_game_id uuid, p_host_secret uuid)
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

  update public.games
    set state = 'ended', phase_deadline = null, updated_at = now()
  where id = p_game_id;

  perform realtime.send(
    jsonb_build_object('state','ended','position',v_game.current_position,'deadline',null,'server_now',now()),
    'phase', 'game:'||p_game_id::text, true);
end;
$$;

revoke execute on function public.end_game(uuid, uuid) from public, anon;
grant  execute on function public.end_game(uuid, uuid) to authenticated;

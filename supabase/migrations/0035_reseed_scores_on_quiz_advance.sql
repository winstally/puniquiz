-- Keep existing players scoreable when a demo hands off to the real quiz.
-- `advance_quiz` intentionally clears play data, but players do not rejoin the
-- same game after the handoff. Recreate zeroed score rows for those players.

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

  insert into public.scores (game_id, player_id, total_points, correct_count, streak)
  select p_game_id, p.id, 0, 0, 0
  from public.players p
  where p.game_id = p_game_id
  on conflict (game_id, player_id) do update
    set total_points = 0,
        correct_count = 0,
        streak = 0,
        updated_at = now();

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

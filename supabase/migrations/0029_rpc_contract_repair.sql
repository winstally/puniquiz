-- Final RPC contract used by the Next server actions and realtime clients.
-- Keep this explicit: several earlier migrations replace functions, which can
-- reset function privileges depending on deployment history/default privileges.

-- Public join/host/gameplay RPCs. Server Actions ensure an anonymous Supabase
-- session before calling these, so the effective caller is authenticated.
revoke all on function public.create_game(uuid, uuid) from public, anon;
grant execute on function public.create_game(uuid, uuid) to authenticated;

revoke all on function public.lookup_game(text) from public;
grant execute on function public.lookup_game(text) to anon, authenticated;

revoke all on function public.join_game(text, text, text, text) from public, anon;
grant execute on function public.join_game(text, text, text, text) to authenticated;

revoke all on function public.get_game_snapshot(uuid) from public, anon;
grant execute on function public.get_game_snapshot(uuid) to authenticated;

revoke all on function public.submit_answer(uuid, text) from public, anon;
grant execute on function public.submit_answer(uuid, text) to authenticated;

revoke all on function public.leave_game(uuid) from public, anon;
grant execute on function public.leave_game(uuid) to authenticated;

-- Host controls. Authority is still checked inside each SECURITY DEFINER RPC by
-- p_host_secret, which the client never receives; Server Actions read it from an
-- httpOnly cookie.
revoke all on function public.host_advance(uuid, uuid) from public, anon;
grant execute on function public.host_advance(uuid, uuid) to authenticated;

revoke all on function public.host_open_answers(uuid, uuid) from public, anon;
grant execute on function public.host_open_answers(uuid, uuid) to authenticated;

revoke all on function public.reveal_round(uuid, uuid) from public, anon;
grant execute on function public.reveal_round(uuid, uuid) to authenticated;

revoke all on function public.reveal_answer(uuid, uuid) from public, anon;
grant execute on function public.reveal_answer(uuid, uuid) to authenticated;

revoke all on function public.set_registration_lock(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_registration_lock(uuid, uuid, boolean) to authenticated;

revoke all on function public.host_start_demo(uuid, uuid) from public, anon;
grant execute on function public.host_start_demo(uuid, uuid) to authenticated;

revoke all on function public.advance_quiz(uuid, uuid) from public, anon;
grant execute on function public.advance_quiz(uuid, uuid) to authenticated;

revoke all on function public.end_game(uuid, uuid) from public, anon;
grant execute on function public.end_game(uuid, uuid) to authenticated;

-- Admin authoring RPCs are only callable through service-role Server Actions
-- after invite-cookie verification.
revoke all on function public.create_quiz(text, text) from public, anon, authenticated;
grant execute on function public.create_quiz(text, text) to service_role;

revoke all on function public.get_quiz_for_edit(uuid) from public, anon, authenticated;
grant execute on function public.get_quiz_for_edit(uuid) to service_role;

revoke all on function public.save_quiz(uuid, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.save_quiz(uuid, text, text, boolean, jsonb) to service_role;

notify pgrst, 'reload schema';

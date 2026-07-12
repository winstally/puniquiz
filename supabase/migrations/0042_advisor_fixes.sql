-- Resolve actionable Supabase advisor findings (2026-07-12).
--
-- 1) unindexed_foreign_keys: games.next_quiz_id (games_next_quiz_id_fkey) had
--    no covering index.
-- 2) *_security_definer_function_executable on the _quiz_* helpers: they are
--    only ever called from inside other SECURITY DEFINER functions (snapshot /
--    reveal builders), which execute as the function owner — callers never
--    need EXECUTE directly, so drop the anon/authenticated grants.
--
-- Deliberately NOT changed:
-- - Game RPCs (join_game, submit_answer, …) stay executable by signed-in users:
--   players authenticate anonymously, so this IS the app's public API surface.
-- - lookup_game stays anon-executable (PIN lookup happens before sign-in).
-- - admin_users / admin_invite_tokens keep RLS-without-policies: deny-all is
--   intentional; they are reached only through SECURITY DEFINER RPCs.
-- - pg_net stays in public: it is not relocatable (would need drop/recreate,
--   risking the cleanup-media scheduler) and its callable objects live in the
--   `net` schema, which PostgREST does not expose.

create index if not exists games_next_quiz_idx
  on public.games (next_quiz_id);

revoke execute on function public._quiz_max_points(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public._quiz_score_max_points(uuid, int, boolean)
  from public, anon, authenticated, service_role;

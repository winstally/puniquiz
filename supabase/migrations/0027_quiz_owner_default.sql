-- 0023_quiz_owner_default.sql
--
-- Keep quiz ownership server-side. Client/server-action callers no longer send
-- owner_id when creating owned quizzes; Postgres resolves it from the JWT.
-- Invite-gated admin quizzes can still be ownerless because the service-role
-- authoring RPC explicitly inserts owner_id = null.

alter table public.quizzes
  alter column owner_id set default auth.uid();

-- Defense in depth: owned quiz inserts must resolve to the caller. Ownerless
-- admin quizzes stay confined to service-role-only authoring RPCs.
drop policy if exists quizzes_insert on public.quizzes;
create policy quizzes_insert on public.quizzes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Existing update policy already prevents reassignment away from the caller for
-- owned rows and preserves invite-gated admin quizzes through server actions.

-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0002_harden.sql : production hardening (layers on top of 0001_init.sql)
-- -----------------------------------------------------------------------------
-- Fixes Supabase advisor findings WITHOUT regressing the verified core loop:
--   (1) FUNCTION EXECUTE surface  — lock down PUBLIC/anon EXECUTE, grant only
--       the client-called RPCs (+ is_game_member, used by RLS) to authenticated.
--   (2) RLS INITPLAN              — wrap auth.uid() as (select auth.uid()) so it
--       is evaluated once per query instead of once per row.
--   (3) UNINDEXED FOREIGN KEYS    — add covering indexes for FKs lacking one.
--
-- Idempotent: drop policy if exists before recreate; create index if not exists.
-- Do NOT edit 0001. Safe to run on the already-migrated DB.
-- =============================================================================


-- =============================================================================
-- (1) FUNCTION EXECUTE SURFACE  (security)
-- -----------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default. Revoke that blanket grant from
-- PUBLIC and from anon, then re-grant EXECUTE only on the explicit set of
-- client-called RPCs to `authenticated`. Internal helpers (_leaderboard,
-- _question_public, _vote_payload), tick(), and rls_auto_enable() are left
-- ungranted — they run inside SECURITY DEFINER context / pg_cron as the owner.
-- =============================================================================

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
-- Supabase default privileges also grant EXECUTE to authenticated at create time;
-- revoke that too, then re-grant only the explicit API set below.
revoke execute on all functions in schema public from authenticated;

-- Client-called RPCs (exact arg signatures confirmed from 0001):
grant execute on function public.create_game(uuid)                       to authenticated;
grant execute on function public.join_game(text, text, text, text)       to authenticated;
grant execute on function public.host_advance(uuid, uuid)                to authenticated;
grant execute on function public.submit_answer(uuid, text)               to authenticated;
grant execute on function public.reveal_round(uuid, uuid)                to authenticated;
grant execute on function public.get_game_snapshot(uuid)                 to authenticated;

-- is_game_member(uuid) is referenced by RLS USING/WITH CHECK predicates, so the
-- querying role must be able to call it (even though it is SECURITY DEFINER).
grant execute on function public.is_game_member(uuid)                    to authenticated;


-- =============================================================================
-- (2) RLS INITPLAN  (performance)
-- -----------------------------------------------------------------------------
-- Every policy below is identical to 0001 except auth.uid() is wrapped as
-- (select auth.uid()) so the planner evaluates it once (InitPlan) rather than
-- per row. TO authenticated and the exact USING/WITH CHECK logic are preserved.
-- =============================================================================

-- quizzes ---------------------------------------------------------------------
drop policy if exists quizzes_select on public.quizzes;
create policy quizzes_select on public.quizzes
  for select to authenticated
  using (is_published or owner_id = (select auth.uid()));

drop policy if exists quizzes_insert on public.quizzes;
create policy quizzes_insert on public.quizzes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists quizzes_update on public.quizzes;
create policy quizzes_update on public.quizzes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));   -- prevents owner reassignment

drop policy if exists quizzes_delete on public.quizzes;
create policy quizzes_delete on public.quizzes
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- questions -------------------------------------------------------------------
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated
  using (exists (
    select 1 from public.quizzes q
    where q.id = quiz_id and (q.is_published or q.owner_id = (select auth.uid()))
  ));

drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions
  for insert to authenticated
  with check (exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = (select auth.uid())
  ));

drop policy if exists questions_update on public.questions;
create policy questions_update on public.questions
  for update to authenticated
  using (exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = (select auth.uid())
  ));

drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions
  for delete to authenticated
  using (exists (
    select 1 from public.quizzes q where q.id = quiz_id and q.owner_id = (select auth.uid())
  ));

-- games -----------------------------------------------------------------------
drop policy if exists games_select on public.games;
create policy games_select on public.games
  for select to authenticated
  using (host_id = (select auth.uid()) or public.is_game_member(id));

-- players ---------------------------------------------------------------------
drop policy if exists players_select on public.players;
create policy players_select on public.players
  for select to authenticated
  using (public.is_game_member(game_id));

drop policy if exists players_update on public.players;
create policy players_update on public.players
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- rounds ----------------------------------------------------------------------
drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds
  for select to authenticated
  using (public.is_game_member(game_id));

-- answers ---------------------------------------------------------------------
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers
  for select to authenticated
  using (exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = (select auth.uid())
  ));

-- scores ----------------------------------------------------------------------
drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores
  for select to authenticated
  using (public.is_game_member(game_id));


-- =============================================================================
-- (3) UNINDEXED FOREIGN KEYS  (performance)
-- -----------------------------------------------------------------------------
-- Add covering indexes for FK columns that have no leading-column index in 0001.
-- Already covered by 0001 (no action): quizzes.owner_id (quizzes_owner_idx),
-- questions.quiz_id (questions_quiz_idx), games.quiz_id (games_quiz_idx),
-- players.game_id (players_game_idx), rounds.game_id (rounds_game_idx),
-- answers.round_id (answers_round_idx), scores.game_id (scores_leaderboard_idx).
-- Remaining gaps below:
-- =============================================================================

create index if not exists games_host_idx       on public.games(host_id);
create index if not exists players_user_idx     on public.players(user_id);
create index if not exists rounds_question_idx   on public.rounds(question_id);
create index if not exists answers_player_idx    on public.answers(player_id);
create index if not exists scores_player_idx     on public.scores(player_id);

-- end 0002_harden.sql

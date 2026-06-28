-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0008_demo_quiz.sql : a protected "demo" quiz that retention never deletes
-- -----------------------------------------------------------------------------
-- So there's always a quiz to experience the game with. quizzes.is_demo marks a
-- curated demo; cleanup_stale_games skips is_demo quizzes (the rest of the 3-month
-- retention is unchanged). Mark one quiz is_demo = true after applying.
--
-- NOTE: a demo owned by an anonymous user could still vanish if its owner row is
-- deleted (FK on delete cascade). For a *truly* permanent demo, give it a stable
-- (non-anonymous) owner. Retention here never deletes auth.users, so an anon owner
-- persists in practice, but a system owner is the robust choice.
-- Idempotent. Do NOT edit 0001–0007.
-- =============================================================================

alter table public.quizzes
  add column if not exists is_demo boolean not null default false;

-- cleanup_stale_games — activity-aware abandoned cleanup (0005) + is_demo guard.
create or replace function public.cleanup_stale_games()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Abandoned, non-ended games — "idle" uses the most recent real activity
  -- (game advance, player last_seen, or an answer), not just games.updated_at.
  delete from public.games g
  where g.state <> 'ended'
    and greatest(
          g.updated_at,
          (select max(p.last_seen_at) from public.players p where p.game_id = g.id),
          (select max(a.answered_at)
             from public.answers a
             join public.rounds r on r.id = a.round_id
            where r.game_id = g.id)
        ) < now() - interval '2 hours';

  -- Finished games (results): retain 3 months, then purge.
  delete from public.games
  where state = 'ended' and updated_at < now() - interval '3 months';

  -- Quizzes inactive 3 months with no recent games → delete — EXCEPT demos.
  delete from public.quizzes q
  where q.updated_at < now() - interval '3 months'
    and not q.is_demo
    and not exists (
      select 1 from public.games g
      where g.quiz_id = q.id and g.updated_at > now() - interval '3 months'
    );
end;
$fn$;

-- end 0008_demo_quiz.sql

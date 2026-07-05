-- =============================================================================
-- puni — リアルタイム・マルチプレイ ライブクイズ
-- 0005_retention.sql : data retention / cleanup of stale games + anon quiz copies
-- -----------------------------------------------------------------------------
-- Why: games are created in `lobby` on host-start and only ever reach `ended` if
-- the host advances through every question. tick() auto-REVEALS but never ENDS a
-- game, so an abandoned lobby / stopped mid-game lives forever AND keeps holding
-- its PIN (the partial unique index only excludes `ended`). Plus every anonymous
-- host gets a private quiz copy. Without cleanup these accumulate unbounded.
--
-- Policy (cleanup_stale_games):
--   * non-ended games idle > 2h        → delete (abandoned junk; frees PIN;
--                                         players/answers/… cascade)
--   * ended games  updated > 3 months  → delete (results retention)
--   * quizzes inactive > 3 months with → delete (cascades questions/games; the
--     no recent games                    quiz-media images orphan → swept by EF)
-- Images themselves live in Storage and DON'T cascade on row delete — a separate
-- Edge Function sweeps orphaned quiz-media objects (Storage API).
--
-- Scheduled every 30 min via pg_cron (guarded: no-op if pg_cron unavailable).
-- The function is server/cron-only (revoked from all client roles).
-- Idempotent. Do NOT edit 0001–0004.
-- =============================================================================

create or replace function public.cleanup_stale_games()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Abandoned, non-ended games (open lobby / stopped mid-game). "Idle" uses the
  -- most recent REAL activity, not just games.updated_at (which only host
  -- advance/reveal bumps): a lobby with players still joining (players.last_seen_at)
  -- or a round with answers landing (answers.answered_at) is NOT abandoned.
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

  -- Quizzes inactive 3 months with no recent games → delete (questions/games
  -- cascade; quiz-media images orphan and are swept by the cleanup Edge Function).
  delete from public.quizzes q
  where q.updated_at < now() - interval '3 months'
    and not exists (
      select 1 from public.games g
      where g.quiz_id = q.id and g.updated_at > now() - interval '3 months'
    );
end;
$$;

-- server/cron only — never client-callable.
revoke execute on function public.cleanup_stale_games() from public, anon, authenticated;

-- Schedule every 30 minutes (guarded: no-op if pg_cron isn't installed).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'puni_cleanup';
    perform cron.schedule('puni_cleanup', '*/30 * * * *', 'select public.cleanup_stale_games();');
  end if;
exception when others then
  -- pg_cron unavailable: cleanup can be run manually / by an external scheduler.
  null;
end $$;

-- end 0005_retention.sql

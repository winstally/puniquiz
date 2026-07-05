"use client";

import { useEffect } from "react";
import type { UseGameState } from "@/lib/realtime/useGameState";
import type { UsePlayerSession } from "@/lib/realtime/usePlayerSession";

const BOOT_BACKOFF_MS = [400, 800, 1600, 3200, 6000] as const;

/** Soft reload — same work as a browser refresh for player + game truth. */
export function refreshPlayerBoot(
  session: Pick<UsePlayerSession, "refresh">,
  game: Pick<UseGameState, "refresh">,
) {
  session.refresh();
  game.refresh();
}

/**
 * Until session + snapshot are ready, keep re-running the boot refresh cycle
 * (session resolve + snapshot pull) — identical to hitting browser reload.
 */
export function usePlayerBootRefresh(
  gameId: string,
  session: Pick<UsePlayerSession, "status" | "isMember" | "refresh">,
  game: Pick<UseGameState, "hydrated" | "refresh">,
) {
  const { status, isMember, refresh: refreshSession } = session;
  const { hydrated, refresh: refreshGame } = game;

  useEffect(() => {
    if (
      status === "no_player" ||
      status === "anonymous_disabled" ||
      status === "error"
    ) {
      return;
    }
    if (isMember && hydrated) return;

    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      if (cancelled) return;
      refreshSession();
      refreshGame();
    };

    const schedule = () => {
      if (cancelled) return;
      const delay =
        BOOT_BACKOFF_MS[Math.min(attempt, BOOT_BACKOFF_MS.length - 1)];
      attempt += 1;
      timer = setTimeout(() => {
        run();
        schedule();
      }, delay);
    };

    run();
    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    gameId,
    status,
    isMember,
    hydrated,
    refreshSession,
    refreshGame,
  ]);
}

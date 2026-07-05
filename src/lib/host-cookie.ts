// Plain (non-"use server") helpers for the host bearer-secret cookie.
//
// These MUST live outside any "use server" file: in Next 16, every export of a
// "use server" module has to be an async function, so constants and sync helpers
// would break the module. Keeping them here lets both the server action
// (createGameAction), host server actions, and the /host/{gameId} page share one
// source of truth.

// httpOnly cookie that carries the host bearer secret for a given game. The
// Host server actions read it to authorize host_advance/reveal_round RPCs.
// Keyed per-game so a single browser can host more than one game over time and
// so the secret is scoped to exactly the game it unlocks.
const HOST_SECRET_COOKIE_PREFIX = "puni-host-";

export function hostSecretCookieName(gameId: string): string {
  return `${HOST_SECRET_COOKIE_PREFIX}${gameId}`;
}

// 6h — long enough for one hosting session.
export const HOST_COOKIE_MAX_AGE = 60 * 60 * 6;

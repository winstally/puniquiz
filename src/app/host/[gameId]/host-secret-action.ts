"use server";

import { cookies } from "next/headers";
import { hostSecretCookieName } from "@/lib/host-cookie";

// readHostSecret — server action that returns the httpOnly host bearer secret
// for a given game, if this browser created it. The secret is stored httpOnly
// by createGameAction, so the client cannot read it via document.cookie; the
// host controller calls this once to authorize host_advance / reveal_round.
//
// Returns null when no secret cookie exists (e.g. someone opened /host/{id}
// without having created the game) — the controller then renders a read-only
// view rather than host controls.
export async function readHostSecret(gameId: string): Promise<string | null> {
  if (!gameId) return null;
  const cookieStore = await cookies();
  return cookieStore.get(hostSecretCookieName(gameId))?.value ?? null;
}

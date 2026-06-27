"use client";

// usePresence — "who is in the lobby right now" + tracks self into presence.
//
// Listeners are NOT attached here: Supabase rejects presence `.on()` after
// subscribe(), so useGameState binds presence sync/join/leave BEFORE subscribe
// and exposes the raw presence state. This hook:
//  - flattens that raw state into a de-duplicated roster keyed by player_id,
//  - tracks "me" into presence once the channel is SUBSCRIBED (track() is allowed
//    after subscribe; only `.on()` is not), re-tracking on reconnect.
//
// Presence is ephemeral connection truth; the authoritative roster still comes
// from get_game_snapshot in useGameState.

import { useEffect, useMemo } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RawPresenceState } from "@/lib/realtime/useGameState";

// The presence payload each client tracks about itself. role distinguishes the
// host big-screen from players so HostScreen can exclude itself from the count.
export type PresenceMeta = {
  player_id: string;
  nickname: string;
  avatar_color: string | null;
  avatar_initial: string | null;
  role: "host" | "player";
};

export type PresenceRosterEntry = PresenceMeta & {
  /** Number of live connections (tabs) this player_id currently has. */
  connections: number;
};

export type UsePresence = {
  /** De-duplicated roster (one entry per player_id), players only by default. */
  roster: PresenceRosterEntry[];
  /** Count of distinct players present (excludes host). */
  count: number;
  /** Raw roster including the host entry, if any consumer needs it. */
  all: PresenceRosterEntry[];
};

type PresenceStateShape = Record<
  string,
  Array<{ presence_ref: string } & Partial<PresenceMeta>>
>;

function flatten(state: PresenceStateShape): PresenceRosterEntry[] {
  const byPlayer = new Map<string, PresenceRosterEntry>();
  for (const presences of Object.values(state)) {
    for (const p of presences) {
      if (!p.player_id) continue;
      const existing = byPlayer.get(p.player_id);
      if (existing) {
        existing.connections += 1;
      } else {
        byPlayer.set(p.player_id, {
          player_id: p.player_id,
          nickname: p.nickname ?? "",
          avatar_color: p.avatar_color ?? null,
          avatar_initial: p.avatar_initial ?? null,
          role: p.role ?? "player",
          connections: 1,
        });
      }
    }
  }
  // Stable order: by nickname then id, so the avatar row doesn't jump around.
  return [...byPlayer.values()].sort(
    (a, b) =>
      a.nickname.localeCompare(b.nickname) ||
      a.player_id.localeCompare(b.player_id),
  );
}

export function usePresence(
  channel: RealtimeChannel | null,
  me: PresenceMeta | null,
  presenceState: RawPresenceState,
  subscribed: boolean,
): UsePresence {
  const all = useMemo(
    () => flatten(presenceState as unknown as PresenceStateShape),
    [presenceState],
  );

  // Track self once the channel is SUBSCRIBED. Re-runs on identity / channel /
  // subscribe changes; a reconnect recreates the channel and flips subscribed,
  // so we re-track automatically.
  const meKey = me
    ? `${me.player_id}|${me.nickname}|${me.avatar_color}|${me.avatar_initial}|${me.role}`
    : null;
  useEffect(() => {
    if (!channel || !me || !subscribed) return;
    void channel.track(me).catch(() => {
      // best-effort; a later reconnect re-tracks.
    });
    return () => {
      // best-effort untrack; the channel may already be tearing down on unmount
      // / reconnect, which can reject. Swallow so it never surfaces unhandled.
      void channel.untrack().catch(() => {});
    };
    // meKey captures every meaningful field of `me`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, meKey, subscribed]);

  const roster = useMemo(() => all.filter((e) => e.role === "player"), [all]);

  return { roster, count: roster.length, all };
}

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

import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { RawPresenceState } from "@/lib/realtime/useGameState";

// The presence payload each client tracks about itself. kind distinguishes the
// host big-screen from players so HostScreen can exclude itself from the count.
export type PresenceMeta = {
  player_id: string;
  nickname: string;
  avatar_color: string | null;
  avatar_initial: string | null;
  kind: "host" | "player";
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
          kind: p.kind ?? "player",
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
  const all = flatten(presenceState as unknown as PresenceStateShape);

  // Track self once the channel is SUBSCRIBED. Re-runs on identity / channel /
  // subscribe changes; a reconnect recreates the channel and flips subscribed,
  // so we re-track automatically.
  const playerId = me?.player_id ?? null;
  const nickname = me?.nickname ?? "";
  const avatarColor = me?.avatar_color ?? null;
  const avatarInitial = me?.avatar_initial ?? null;
  const kind = me?.kind ?? "player";
  useEffect(() => {
    if (!channel || !playerId || !subscribed) return;
    const trackedMe: PresenceMeta = {
      player_id: playerId,
      nickname,
      avatar_color: avatarColor,
      avatar_initial: avatarInitial,
      kind,
    };
    void channel.track(trackedMe).catch(() => {
      // best-effort; a later reconnect re-tracks.
    });
    return () => {
      // best-effort untrack; the channel may already be tearing down on unmount
      // / reconnect, which can reject. Swallow so it never surfaces unhandled.
      void channel.untrack().catch(() => {});
    };
  }, [channel, playerId, nickname, avatarColor, avatarInitial, kind, subscribed]);

  const roster = all.filter((e) => e.kind === "player");

  return { roster, count: roster.length, all };
}

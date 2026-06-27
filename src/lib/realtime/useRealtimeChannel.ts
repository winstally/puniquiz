"use client";

// useRealtimeChannel — owns the single private realtime channel `game:{gameId}`.
//
// Responsibilities:
// - Create exactly one channel per gameId and tear it down on unmount / id change.
// - Authenticate realtime with the current session BEFORE subscribe (required for
//   private channels / Realtime Authorization RLS on realtime.messages).
// - Re-authenticate + re-subscribe on auth-token refresh.
// - Expose a coarse connection `status` plus an auto-resubscribe backoff loop and a
//   monotonically increasing `reconnectNonce` that downstream hooks watch to know
//   "the channel just (re)established — re-fetch authoritative truth".
//
// It does NOT know about game payloads; the consumer passes a `bind(channel)`
// callback that registers all `.on(...)` listeners. We invoke it BEFORE
// subscribe() because Supabase rejects presence `.on()` added after subscribe().

import { useEffect, useRef, useState } from "react";
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { gameChannel } from "@/lib/realtime/events";

export type ChannelStatus =
  | "idle"
  | "connecting"
  | "subscribed"
  | "error"
  | "closed";

export type UseRealtimeChannel = {
  /** The live channel, or null until it has been created for the current gameId. */
  channel: RealtimeChannel | null;
  /** Coarse connection lifecycle status. */
  status: ChannelStatus;
  /** Increments every time the channel reaches SUBSCRIBED (initial + each reconnect). */
  reconnectNonce: number;
  /** True once the channel has reached SUBSCRIBED at least once. */
  ready: boolean;
};

// Exponential backoff schedule (ms), capped. Index clamps at the last entry.
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000] as const;

export function useRealtimeChannel(
  gameId: string | null | undefined,
  // Registers all `.on(...)` listeners on the channel; called once per (re)create
  // BEFORE subscribe(). Must be stable (e.g. useCallback) so it never recreates
  // the channel spuriously.
  bind?: (channel: RealtimeChannel) => void,
): UseRealtimeChannel {
  const [status, setStatus] = useState<ChannelStatus>("idle");
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [ready, setReady] = useState(false);
  // The channel is kept in a ref (stable identity for handlers) and mirrored into
  // state so consumers re-render when it first appears.
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    // No game → nothing to connect. We intentionally do NOT setState here
    // (React Compiler flags synchronous setState in effects); instead the
    // returned values are derived to safe defaults below when !gameId.
    if (!gameId) return;

    const supabase = createClient();
    const topic = gameChannel(gameId);
    let disposed = false;
    let attempt = 0;
    // Serialize connect(): a second invocation while one is in flight (StrictMode
    // double-invoke, a SIGNED_IN landing mid-connect) sets `pending` and re-runs
    // once at the end instead of racing — which would otherwise create two
    // channels on the same topic and bind presence on an already-joined one.
    let connecting = false;
    let pending = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleRetry = () => {
      clearRetry();
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(() => {
        // connect() never rejects (it try/catches its own body), but guard the
        // call site anyway so a future refactor can't leak an unhandled rejection.
        if (!disposed) connect().catch(() => {});
      }, delay);
    };

    // Best-effort realtime re-auth that can never reject unhandled. Token-attach
    // failures are non-fatal: subscribe() (or its retry) will surface a real
    // CHANNEL_ERROR if authorization actually fails.
    const safeSetAuth = (token: string | null) =>
      supabase.realtime.setAuth(token).catch((e) => {
        console.warn("[useRealtimeChannel] setAuth failed", e);
      });

    // (Re)create + subscribe the channel. Always tears down any prior instance
    // first so we never leak duplicate subscriptions on retry.
    //
    // This fn OWNS its error handling: the entire body is wrapped so the
    // `void connect()` / `connect().catch()` call sites can never observe a
    // rejection. On an unexpected failure we log + schedule a retry.
    const connect = async (): Promise<void> => {
      if (disposed) return;
      if (connecting) {
        // Already connecting — request exactly one re-run when it finishes.
        pending = true;
        return;
      }
      connecting = true;
      clearRetry();
      setStatus("connecting");

      try {
        // Clean slate: remove ANY channel already registered for this topic (a
        // prior instance, or a leftover from a double-invoked effect) so the
        // channel we bind + subscribe below is always freshly created and unjoined
        // — otherwise `supabase.channel(topic)` collisions make bind() run on an
        // already-joined channel ("cannot add presence after subscribe()").
        channelRef.current = null;
        for (const c of supabase.getChannels()) {
          if (c.topic === topic || c.topic === `realtime:${topic}`) {
            try {
              await supabase.removeChannel(c);
            } catch {
              // best-effort teardown
            }
          }
        }
        if (disposed) return;

        // Realtime Authorization needs the access token attached before subscribe.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (disposed) return;
        await supabase.realtime.setAuth(session?.access_token ?? null);
        if (disposed) return;

        const next = supabase.channel(topic, {
          config: { private: true },
        });
        channelRef.current = next;
        setChannel(next);

        // Register all listeners (presence + broadcast) BEFORE subscribe() —
        // Supabase rejects presence `.on()` added after subscribe().
        bind?.(next);

        next.subscribe((subStatus, err) => {
          if (disposed) return;
          switch (subStatus) {
            case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
              attempt = 0;
              clearRetry();
              setStatus("subscribed");
              setReady(true);
              // Signal "(re)connected" so consumers re-pull authoritative truth.
              setReconnectNonce((n) => n + 1);
              break;
            case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
            case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
              setStatus("error");
              if (err) {
                // Surface for debugging without throwing inside the callback.
                console.warn(`[useRealtimeChannel] ${topic} ${subStatus}`, err);
              }
              scheduleRetry();
              break;
            case REALTIME_SUBSCRIBE_STATES.CLOSED:
              setStatus("closed");
              // Only auto-retry an unexpected close while still mounted.
              if (!disposed) scheduleRetry();
              break;
          }
        });
      } catch (e) {
        // getSession / setAuth / channel setup threw. Don't let it escape as an
        // unhandled rejection; log once and back off into a retry while mounted.
        if (disposed) return;
        console.warn(`[useRealtimeChannel] ${topic} connect failed`, e);
        setStatus("error");
        scheduleRetry();
      } finally {
        connecting = false;
        // A reconnect was requested while we were busy (e.g. token refresh) —
        // run exactly one more pass now, with the latest auth.
        if (pending && !disposed) {
          pending = false;
          void connect();
        }
      }
    };

    // Re-auth realtime whenever the token rotates (refresh / sign-in). On a fresh
    // sign-in we also re-subscribe so the private channel re-authorizes.
    const { data: authSub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (disposed) return;
        void safeSetAuth(session?.access_token ?? null);
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          attempt = 0;
          void connect();
        }
      },
    );

    void connect();

    return () => {
      disposed = true;
      clearRetry();
      authSub.subscription.unsubscribe();
      const current = channelRef.current;
      channelRef.current = null;
      // Fire-and-forget teardown: swallow benign removeChannel rejections that
      // can occur if the socket is already closing on unmount.
      if (current) {
        supabase.removeChannel(current).catch((e) => {
          console.warn("[useRealtimeChannel] removeChannel failed", e);
        });
      }
    };
  }, [gameId, bind]);

  // When there is no game, present safe idle defaults without ever having to
  // setState from the effect (the effect simply no-ops for a falsy gameId).
  if (!gameId) {
    return { channel: null, status: "idle", reconnectNonce: 0, ready: false };
  }

  return { channel, status, reconnectNonce, ready };
}

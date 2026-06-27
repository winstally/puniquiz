"use client";

// useHostController — thin, race-safe wrapper around the host RPCs.
//
// Authority lives entirely in the SECURITY DEFINER RPCs (host_advance /
// reveal_round), which verify host_secret. This hook only:
//  - calls them with the right args,
//  - serializes calls behind a single `pending` flag so a double-click can't
//    fire two advances (the server also guards via WHERE state=<expected>, but
//    disabling the button is the first line of defense + better UX),
//  - surfaces an error toast on failure.
//
// start() and next() are both `host_advance` (the state machine decides what the
// step means: lobby/scoreboard → open next question or → ended; question_open →
// locked). reveal() is `reveal_round`.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export type UseHostController = {
  /** True while any host RPC is in flight (disable the controls). */
  pending: boolean;
  /** lobby/scoreboard → open next question (or end). Alias of next(). */
  start: () => Promise<void>;
  /** Advance the state machine one step. */
  next: () => Promise<void>;
  /** Compute scores + reveal the correct answer. */
  reveal: () => Promise<void>;
  /** Toggle registration lock — stop / reopen new players joining. */
  setLock: (locked: boolean) => Promise<void>;
  /** Abort an in-flight game back to the lobby (clears rounds/scores). */
  resetToLobby: () => Promise<void>;
};

export function useHostController(
  gameId: string,
  hostSecret: string | null | undefined,
): UseHostController {
  const [pending, setPending] = useState(false);
  // Synchronous re-entry guard: state updates are async, so a rapid second click
  // could slip through before `pending` flips. The ref closes that window.
  const inFlight = useRef(false);

  const run = async (
    // The RPC builders are thenable (PromiseLike) rather than true Promises.
    fn: (
      supabase: ReturnType<typeof createClient>,
    ) => PromiseLike<{ error: unknown }>,
    failMessage: string,
  ) => {
    if (inFlight.current) return;
    if (!gameId || !hostSecret) {
      toast.error("ホスト権限がありません");
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const supabase = createClient();
      const { error } = await fn(supabase);
      if (error) {
        const message =
          typeof error === "object" && error && "message" in error
            ? String((error as { message: unknown }).message)
            : failMessage;
        toast.error(failMessage, { description: message });
      }
    } catch (e) {
      toast.error(failMessage, {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const next = () =>
    run(
      (supabase) =>
        supabase.rpc("host_advance", {
          p_game_id: gameId,
          p_host_secret: hostSecret!,
        }),
      "進行できませんでした",
    );

  const reveal = () =>
    run(
      (supabase) =>
        supabase.rpc("reveal_round", {
          p_game_id: gameId,
          p_host_secret: hostSecret!,
        }),
      "正解発表できませんでした",
    );

  const setLock = (locked: boolean) =>
    run(
      (supabase) =>
        supabase.rpc("set_registration_lock", {
          p_game_id: gameId,
          p_host_secret: hostSecret!,
          p_locked: locked,
        }),
      locked ? "締め切れませんでした" : "再開できませんでした",
    );

  const resetToLobby = () =>
    run(
      (supabase) =>
        supabase.rpc("host_reset_to_lobby", {
          p_game_id: gameId,
          p_host_secret: hostSecret!,
        }),
      "ロビーに戻せませんでした",
    );

  return { pending, start: next, next, reveal, setLock, resetToLobby };
}

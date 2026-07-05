"use client";

// usePlayerSession — the participant's identity + answering surface.
//
// Responsibilities:
//  - Resolve the anonymous session server-side, so the player has an auth.uid()
//    for RLS / Realtime Authorization without exposing data RPCs in the client.
//  - Resolve this user's player row for the game (the join_game RPC, called from
//    the join flow, already created it; we look it up here for identity and to
//    recover after reconnect/refresh).
//  - Recover this round's committed answer from get_game_snapshot, so a refresh /
//    late-join shows the player's prior pick.
//  - pick(choiceKey): optimistic local `picked`, then submitAnswerAction, then
//    reconcile against the server's accepted/choice_key (UNIQUE swallows
//    re-answers -> accepted:false; we keep the server-recorded value and toast).
//
// `picked` is the *choice_key* the player has committed to this round (or null).
// The composing screen maps it to an index via the hydrated choices.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getPlayerSessionAction,
  leaveGameAction,
  submitAnswerAction,
} from "@/app/actions";
import type { PlayerRow } from "@/lib/supabase/database.types";
import type { MyAnswer, SubmitAnswerResult } from "@/lib/realtime/events";

export type PlayerStatus =
  | "loading" // resolving session / player row
  | "ready" // session + player resolved (a member)
  | "anonymous_disabled" // signInAnonymously rejected (provider off)
  | "no_player" // session ok but no player row for this game (must join)
  | "error";

export type UsePlayerSession = {
  /** Discriminated lifecycle status; "no_player" means "show the join prompt". */
  status: PlayerStatus;
  /** Convenience: true while still resolving the session + player row. */
  loading: boolean;
  /** Convenience: true once a player row for this game exists. */
  isMember: boolean;
  /** This player's row for the game, or null until resolved. */
  player: PlayerRow | null;
  /** The auth user id (anonymous), or null until the session exists. */
  userId: string | null;
  /** This player's display nickname (from the player row), "" until resolved. */
  nickname: string;
  /** This player's avatar initial, or null. */
  avatarInitial: string | null;
  /** This player's avatar color, or null. */
  avatarColor: string | null;
  /** The choice_key this player has committed to this round (optimistic), or null. */
  picked: string | null;
  /** Alias of `picked` — the optimistic/committed choice_key, or null. */
  optimisticKey: string | null;
  /** The server-recorded answer for the current round (from snapshot), or null. */
  myAnswer: MyAnswer | null;
  /** True while an answer submit action is in flight. */
  submitting: boolean;
  /** Optimistically pick a choice and submit it; reconciles with the server. */
  pick: (choiceKey: string) => Promise<void>;
  /** Clear the local pick (call when a new question opens). */
  resetPick: () => void;
  /** Force a re-resolution of session + player + my_answer (e.g. after reconnect). */
  refresh: () => void;
  /** Cancel participation — delete this player's row (answers/scores cascade). */
  leave: () => Promise<void>;
};

type SubmitChoiceResult =
  | { ok: true; result: SubmitAnswerResult }
  | { ok: false; error: string | null };

type ScopedChoice = {
  scope: string | null;
  choiceKey: string;
};

type ScopedAnswer = {
  scope: string | null;
  answer: MyAnswer;
};

async function submitChoice(
  gameId: string,
  choiceKey: string,
): Promise<SubmitChoiceResult> {
  try {
    const submitted = await submitAnswerAction(gameId, choiceKey);
    if (!submitted.ok) return { ok: false, error: submitted.error };
    return { ok: true, result: submitted.result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : null };
  }
}

export function usePlayerSession(
  gameId: string,
  answerScope: string | null,
): UsePlayerSession {
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [picked, setPicked] = useState<ScopedChoice | null>(null);
  const [myAnswer, setMyAnswer] = useState<ScopedAnswer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Guards a concurrent submit and remembers the pre-optimistic value to roll
  // back to on rejection.
  const submitInFlight = useRef(false);

  const refresh = () => setRefreshNonce((n) => n + 1);
  const resetPick = () => setPicked(null);

  // Best-effort leave: delete the player row server-side. The caller navigates
  // away afterwards regardless — leaving the page untracks presence either way.
  const leave = async () => {
    if (!gameId) return;
    try {
      const left = await leaveGameAction(gameId);
      if (!left.ok) toast.error("退出に失敗しました", { description: left.error });
    } catch (e) {
      toast.error("退出に失敗しました", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  // Resolve anonymous session + this game's player row + my_answer.
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    // OWNS its error handling: the entire body is try/caught so the `void
    // resolve()` call site can never observe a rejection (auth / network drop).
    // Every setState is gated on `cancelled` so we never update after unmount.
    const resolve = async (): Promise<void> => {
      // Background refresh (reconnect) — keep "ready" so the lobby UI doesn't flash.
      setStatus((s) => (s === "ready" ? "ready" : "loading"));

      try {
        const resolved = await getPlayerSessionAction(gameId);
        if (cancelled) return;
        if (!resolved.ok) {
          setStatus(
            /サインイン/.test(resolved.error) ? "anonymous_disabled" : "error",
          );
          return;
        }

        setUserId(resolved.userId);
        const row = resolved.player;
        setPlayer(row);
        setMyAnswer(
          resolved.myAnswer ? { scope: answerScope, answer: resolved.myAnswer } : null,
        );
        // Seed the committed pick from the server's record so a refresh shows it.
        setPicked(
          resolved.myAnswer?.choice_key
            ? { scope: answerScope, choiceKey: resolved.myAnswer.choice_key }
            : null,
        );

        setStatus(row ? "ready" : "no_player");
      } catch (e) {
        if (cancelled) return;
        console.warn("[usePlayerSession] resolve threw", e);
        setStatus("error");
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [gameId, answerScope, refreshNonce]);

  const scopedPicked = picked?.scope === answerScope ? picked.choiceKey : null;
  const scopedMyAnswer = myAnswer?.scope === answerScope ? myAnswer.answer : null;

  const pick = async (choiceKey: string) => {
      if (submitInFlight.current) return;
      if (!gameId) return;
      if (!answerScope) return;
      // Already committed to this exact choice — nothing to do.
      if (scopedPicked === choiceKey) return;

      const previous = picked;
      submitInFlight.current = true;
      setSubmitting(true);
      // Optimistic: reflect the tap immediately.
      setPicked({ scope: answerScope, choiceKey });

      const submitted = await submitChoice(gameId, choiceKey);
      if (!submitted.ok) {
        // Hard failure (closed round, deadline passed, not a member, ...).
        setPicked(previous);
        toast.error("回答できませんでした", { description: submitted.error ?? undefined });
        submitInFlight.current = false;
        setSubmitting(false);
        return;
      }

      const { result } = submitted;
      if (result.accepted) {
        // Reconcile to the server-confirmed key (normally identical).
        setPicked({ scope: answerScope, choiceKey: result.choice_key });
        setMyAnswer({
          scope: answerScope,
          answer: {
            choice_key: result.choice_key,
            is_correct: null,
            awarded_points: null,
          },
        });
      } else {
        // Re-answer swallowed by UNIQUE -> keep whatever the server already has.
        // result.choice_key is the previously-recorded answer.
        setPicked({ scope: answerScope, choiceKey: result.choice_key });
        toast("回答は最初のものが記録されました", {
          description: "1問につき1回だけ回答できます",
        });
      }
      submitInFlight.current = false;
      setSubmitting(false);
  };

  return {
    status,
    loading: status === "loading",
    isMember: status === "ready",
    player,
    userId,
    nickname: player?.nickname ?? "",
    avatarInitial: player?.avatar_initial ?? null,
    avatarColor: player?.avatar_color ?? null,
    picked: scopedPicked,
    optimisticKey: scopedPicked,
    myAnswer: scopedMyAnswer,
    submitting,
    pick,
    resetPick,
    refresh,
    leave,
  };
}

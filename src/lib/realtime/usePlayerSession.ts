"use client";

// usePlayerSession — the participant's identity + answering surface.
//
// Responsibilities:
//  - Ensure an anonymous auth session exists (signInAnonymously if none), so the
//    player has an auth.uid() for RLS / Realtime Authorization.
//  - Resolve this user's player row for the game (the join_game RPC, called from
//    the join flow, already created it; we look it up here for identity and to
//    recover after reconnect/refresh).
//  - Recover this round's committed answer from get_game_snapshot, so a refresh /
//    late-join shows the player's prior pick.
//  - pick(choiceKey): optimistic local `picked`, then submit_answer RPC, then
//    reconcile against the server's accepted/choice_key (UNIQUE swallows
//    re-answers → accepted:false; we keep the server-recorded value and toast).
//
// `picked` is the *choice_key* the player has committed to this round (or null).
// The composing screen maps it to an index via the hydrated choices.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { PlayerRow } from "@/lib/supabase/database.types";
import type {
  GameSnapshot,
  MyAnswer,
  SubmitAnswerResult,
} from "@/lib/realtime/events";

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
  /** True while a submit_answer RPC is in flight. */
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

export function usePlayerSession(gameId: string): UsePlayerSession {
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [myAnswer, setMyAnswer] = useState<MyAnswer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Guards a concurrent submit and remembers the pre-optimistic value to roll
  // back to on rejection.
  const submitInFlight = useRef(false);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);
  const resetPick = useCallback(() => setPicked(null), []);

  // Best-effort leave: delete the player row server-side. The caller navigates
  // away afterwards regardless — leaving the page untracks presence either way.
  const leave = useCallback(async () => {
    if (!gameId) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("leave_game", { p_game_id: gameId });
      if (error) toast.error("退出に失敗しました", { description: error.message });
    } catch (e) {
      toast.error("退出に失敗しました", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }, [gameId]);

  // Resolve anonymous session + this game's player row + my_answer.
  useEffect(() => {
    if (!gameId) return;
    const supabase = createClient();
    let cancelled = false;

    // OWNS its error handling: the entire body is try/caught so the `void
    // resolve()` call site can never observe a rejection (auth / network drop).
    // Every setState is gated on `cancelled` so we never update after unmount.
    const resolve = async (): Promise<void> => {
      // Background refresh (reconnect) — keep "ready" so the lobby UI doesn't flash.
      setStatus((s) => (s === "ready" ? "ready" : "loading"));

      try {
        // 1) Ensure a session (anonymous if needed).
        let {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (cancelled) return;
          if (error || !data.session) {
            setStatus("anonymous_disabled");
            return;
          }
          session = data.session;
        }
        if (cancelled) return;
        setUserId(session.user.id);

        // 2) Player row (RLS scopes SELECT to same-game members; UNIQUE → ≤1 row)
        //    and the authoritative my_answer in parallel.
        const [playerRes, snapRes] = await Promise.all([
          supabase
            .from("players")
            .select("*")
            .eq("game_id", gameId)
            .eq("user_id", session.user.id)
            .limit(1),
          supabase.rpc("get_game_snapshot", { p_game_id: gameId }),
        ]);
        if (cancelled) return;

        if (playerRes.error) {
          setStatus("error");
          return;
        }

        const row = (playerRes.data?.[0] as PlayerRow | undefined) ?? null;
        setPlayer(row);

        if (!snapRes.error && snapRes.data) {
          const snap = snapRes.data as unknown as GameSnapshot;
          setMyAnswer(snap.my_answer ?? null);
          // Seed the committed pick from the server's record so a refresh shows it.
          setPicked(snap.my_answer?.choice_key ?? null);
        }

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
  }, [gameId, refreshNonce]);

  const pick = useCallback(
    async (choiceKey: string) => {
      if (submitInFlight.current) return;
      if (!gameId) return;
      // Already committed to this exact choice — nothing to do.
      if (picked === choiceKey) return;

      const previous = picked;
      submitInFlight.current = true;
      setSubmitting(true);
      // Optimistic: reflect the tap immediately.
      setPicked(choiceKey);

      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("submit_answer", {
          p_game_id: gameId,
          p_choice_key: choiceKey,
        });

        if (error) {
          // Hard failure (closed round, deadline passed, not a member, …).
          setPicked(previous);
          toast.error("回答できませんでした", { description: error.message });
          return;
        }

        const result = data as unknown as SubmitAnswerResult | null;
        if (!result) {
          setPicked(previous);
          toast.error("回答できませんでした");
          return;
        }

        if (result.accepted) {
          // Reconcile to the server-confirmed key (normally identical).
          setPicked(result.choice_key);
          setMyAnswer({
            choice_key: result.choice_key,
            is_correct: null,
            awarded_points: null,
          });
        } else {
          // Re-answer swallowed by UNIQUE → keep whatever the server already has.
          // result.choice_key is the previously-recorded answer.
          setPicked(result.choice_key);
          toast("回答は最初のものが記録されました", {
            description: "1問につき1回だけ回答できます",
          });
        }
      } catch (e) {
        setPicked(previous);
        toast.error("回答できませんでした", {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        submitInFlight.current = false;
        setSubmitting(false);
      }
    },
    [gameId, picked],
  );

  return {
    status,
    loading: status === "loading",
    isMember: status === "ready",
    player,
    userId,
    nickname: player?.nickname ?? "",
    avatarInitial: player?.avatar_initial ?? null,
    avatarColor: player?.avatar_color ?? null,
    picked,
    optimisticKey: picked,
    myAnswer,
    submitting,
    pick,
    resetPick,
    refresh,
    leave,
  };
}

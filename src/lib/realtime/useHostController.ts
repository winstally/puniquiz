"use client";

// useHostController — thin, race-safe wrapper around the host RPCs.
//
// Authority lives in server actions + SECURITY DEFINER RPCs. The actions read
// the httpOnly host cookie and pass the host_secret to the RPC; the client never
// receives that bearer secret. This hook only:
//  - calls the right action,
//  - serializes calls behind a single `pending` flag so a double-click can't
//    fire two advances (the server also guards via WHERE state=<expected>, but
//    disabling the button is the first line of defense + better UX),
//  - surfaces an error toast on failure.
//
// start() and next() are both `host_advance` (the state machine decides what the
// step means: lobby/scoreboard → open next question or → ended; question_open →
// locked; reveal → scoreboard). reveal() is `reveal_round`.

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  advanceQuizAction,
  endGameAction,
  hostAdvanceAction,
  hostOpenAnswersAction,
  hostStartDemoAction,
  revealAnswerAction,
  revealRoundAction,
  setAnswerModeAction,
  setRegistrationLockAction,
  type ActionResult,
} from "@/app/actions";

export type UseHostController = {
  /** True while any host RPC is in flight (disable the controls). */
  pending: boolean;
  /** lobby/scoreboard → open next question (or end). Alias of next(). */
  start: () => Promise<void>;
  /** Advance the state machine one step. */
  next: () => Promise<void>;
  /** From an open question (await), start the 3-2-1 countdown + answer window. */
  openAnswers: () => Promise<void>;
  /** Compute scores + enter the reveal (drumroll) — withholds the answer. */
  reveal: () => Promise<void>;
  /** Release the correct answer when the drumroll lands (second reveal step). */
  revealAnswer: () => Promise<void>;
  /** Toggle registration lock — stop / reopen new players joining. */
  setLock: (locked: boolean) => Promise<void>;
  /** Toggle the answer mode (lobby only): 早押し ⇄ 変更できるじっくりモード. */
  setAnswerMode: (allowed: boolean) => Promise<void>;
  /** From the lobby, warm up with the demo first (real quiz continues after). */
  startDemo: () => Promise<void>;
  /** After ending, continue the SAME game with the queued next quiz (→ lobby). */
  advanceQuiz: () => Promise<void>;
  /** End the whole session — set state to ended for everyone (host quits). */
  end: () => Promise<void>;
};

async function runHostRpc(
  fn: () => Promise<ActionResult<object>>,
  failMessage: string,
): Promise<void> {
  const result = await fn();
  if (result.ok) return;
  toast.error(failMessage, { description: result.error });
}

function describeError(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function useHostController(
  gameId: string,
  isHost: boolean,
): UseHostController {
  const [pending, setPending] = useState(false);
  // Synchronous re-entry guard: state updates are async, so a rapid second click
  // could slip through before `pending` flips. The ref closes that window.
  const inFlight = useRef(false);

  const run = async (
    fn: () => Promise<ActionResult<object>>,
    failMessage: string,
  ) => {
    if (inFlight.current) return;
    if (!gameId || !isHost) {
      toast.error("ホスト権限がありません");
      return;
    }
    inFlight.current = true;
    setPending(true);
    return runHostRpc(fn, failMessage)
      .catch((e: unknown) => {
        toast.error(failMessage, { description: describeError(e) });
      })
      .finally(() => {
        inFlight.current = false;
        setPending(false);
      });
  };

  const next = () =>
    run(
      () => hostAdvanceAction(gameId),
      "進行できませんでした",
    );

  const openAnswers = () =>
    run(
      () => hostOpenAnswersAction(gameId),
      "回答を開始できませんでした",
    );

  const reveal = () =>
    run(
      () => revealRoundAction(gameId),
      "正解発表できませんでした",
    );

  const revealAnswer = () =>
    run(
      () => revealAnswerAction(gameId),
      "正解の表示に失敗しました",
    );

  const setLock = (locked: boolean) =>
    run(
      () => setRegistrationLockAction(gameId, locked),
      locked ? "締め切れませんでした" : "再開できませんでした",
    );

  const setAnswerMode = (allowed: boolean) =>
    run(
      () => setAnswerModeAction(gameId, allowed),
      "回答モードを変更できませんでした",
    );

  const startDemo = () =>
    run(
      () => hostStartDemoAction(gameId),
      "デモを開始できませんでした",
    );

  const advanceQuiz = () =>
    run(
      () => advanceQuizAction(gameId),
      "次のクイズに進めませんでした",
    );

  const end = () =>
    run(
      () => endGameAction(gameId),
      "ゲームを中止できませんでした",
    );

  return { pending, start: next, next, openAnswers, reveal, revealAnswer, setLock, setAnswerMode, startDemo, advanceQuiz, end };
}

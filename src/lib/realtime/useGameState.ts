"use client";

// useGameState — the authoritative, reconnect-safe view of one game.
//
// This hook OWNS the single private realtime channel (via useRealtimeChannel) and
// exposes everything a screen needs to render a game. Consumers call it with just
// the gameId; the channel lifecycle is internal.
//
// Truth model (per the plan):
//  1. On mount and on every (re)connect, call get_game_snapshot — the single
//     source of authoritative truth (state, current question, deadline,
//     server_now, my vote tally, correct_key only if already revealed, roster,
//     leaderboard).
//  2. Layer live broadcasts on top: `phase`, `question`, `vote`, `reveal`,
//     `scoreboard`. Broadcasts only mutate the fields they own.
//  3. Timer is computed locally from the absolute `phase_deadline` plus a clock
//     offset derived from `server_now` (server clock − client clock). secondsLeft
//     recomputes from the absolute deadline so it self-corrects against drift.
//
// ALL channel listeners (broadcast + presence) are registered in `bind`, which
// useRealtimeChannel invokes BEFORE subscribe() — Supabase rejects presence
// `.on()` added after subscribe(). Presence state is exposed raw for usePresence.
//
// correctKey is undefined until a `reveal` (or a snapshot taken post-reveal), so
// consumers can never show the answer early.

import { useEffect, useReducer, useRef, useState, type Dispatch } from "react";
import { getGamePinAction, getGameSnapshotAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_PRESENCE_LISTEN_EVENTS,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import {
  GAME_EVENTS,
  type GameSnapshot,
  type GameState,
  type LeaderboardEntry,
  type LockEvent,
  type PhaseEvent,
  type PublicChoice,
  type QuestionEvent,
  type RevealEvent,
  type RosterEntry,
  type ScoreboardEvent,
  type VoteCounts,
  type VoteEvent,
} from "@/lib/realtime/events";
import {
  useRealtimeChannel,
  type ChannelStatus,
} from "@/lib/realtime/useRealtimeChannel";
import { DRUMROLL_MS, DRUMROLL_STUCK_RECOVERY_GRACE_MS } from "@/lib/reveal-timing";

// Raw presence state as Supabase reports it (channel.presenceState()). usePresence
// flattens this; we keep it opaque here to avoid coupling.
export type RawPresenceState = Record<string, unknown[]>;

// The question as the hook holds it. `choices` are the public {key,label} pairs;
// components hydrate them through hydrateChoices for rendering.
export type GameQuestion = {
  position: number;
  eyebrow: string | null;
  text: string;
  choices: PublicChoice[];
  time_limit_seconds: number;
  /** This question's worth — full points for an instant correct answer. */
  points_base: number;
  media_url?: string | null;
};

export type UseGameState = {
  state: GameState;
  position: number;
  question: GameQuestion | null;
  /** Absolute ISO deadline of the current phase, or null. */
  deadline: string | null;
  /** Whole seconds remaining, computed from deadline + clock offset. 0 when none. */
  secondsLeft: number;
  /** ISO time answers unlock (after the countdown+reading lead), or null. */
  answersOpenAt: string | null;
  /** Whole seconds until answers open (0 once open). */
  secondsUntilAnswers: number;
  /** Sub-phase of a live question: countdown → reading → answering (null otherwise). */
  roundPhase: RoundPhase;
  /** 3-2-1 number during the countdown sub-phase (0 otherwise). */
  countdownNumber: number;
  /** Live aggregate tally: choice_key -> count. */
  counts: VoteCounts;
  total: number;
  /** Undefined until the round is revealed (snapshot post-reveal or `reveal`). */
  correctKey: string | undefined;
  /** Convenience: true when state === "reveal". */
  revealed: boolean;
  /** Number of correct answers this round (set at reveal). */
  correctCount: number;
  leaderboard: LeaderboardEntry[];
  /** Authoritative roster from the latest snapshot (presence is separate). */
  roster: RosterEntry[];
  /** Game PIN (for display / deep-link join), null until loaded. */
  pin: string | null;
  /** True once the first snapshot has been applied. */
  hydrated: boolean;
  /** The game no longer exists (deleted / bad id / retention) — caller should leave. */
  notFound: boolean;
  /** Registration lock — true when the host has stopped new players joining. */
  registrationLocked: boolean;
  /** A next quiz is queued — once ended, the host can continue the same game. */
  hasNext: boolean;
  /** The current quiz is the curated demo (server truth — survives reload/share). */
  isDemo: boolean;
  /** Underlying channel (for usePresence track / host broadcasts). */
  channel: RealtimeChannel | null;
  /** Coarse channel connection status. */
  channelStatus: ChannelStatus;
  /** True once the channel has reached SUBSCRIBED (safe to track presence). */
  subscribed: boolean;
  /** Raw presence state from the channel; feed to usePresence to flatten. */
  presence: RawPresenceState;
  /** Re-pull snapshot + player truth — same as a soft page reload for game state. */
  refresh: () => void;
};

function toQuestion(
  q: GameSnapshot["current_question"],
): GameQuestion | null {
  if (!q) return null;
  return {
    position: q.position,
    eyebrow: q.eyebrow,
    text: q.text,
    choices: q.choices,
    time_limit_seconds: q.time_limit_seconds,
    points_base: q.points_base ?? 1000,
    media_url: q.media_url ?? null,
  };
}

// clock offset = server_now − client_now (ms). Add to Date.now() to estimate
// the server's current time, then secondsLeft = (deadline − serverNow)/1000.
function computeOffset(serverNowIso: string): number {
  const server = new Date(serverNowIso).getTime();
  if (Number.isNaN(server)) return 0;
  return server - Date.now();
}

// How long to hold the answer after a reveal, as a pure SERVER-clock duration
// (answer_reveal_at − server_now). Both are server times, so this needs no client
// offset; the answer then appears at the same instant on every device.
function revealDelayMs(atIso: string | null | undefined, nowIso: string | null | undefined): number {
  if (!atIso || !nowIso) return 0;
  const at = new Date(atIso).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(at) || Number.isNaN(now)) return 0;
  return Math.max(0, at - now);
}

function scheduleCorrectReveal(
  timerRef: { current: ReturnType<typeof setTimeout> | null },
  dispatch: Dispatch<GameViewAction>,
  key: string | undefined,
  atIso: string | null | undefined,
  nowIso: string | null | undefined,
): void {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  if (!key) {
    dispatch({ type: "correctKey", key: undefined });
    return;
  }
  const delay = revealDelayMs(atIso, nowIso);
  if (delay <= 0) {
    dispatch({ type: "correctKey", key });
    return;
  }
  timerRef.current = setTimeout(() => dispatch({ type: "correctKey", key }), delay);
}

// Sub-phases of an open question (host-driven, see 0015):
//   await     — the question is parked on screen; the host reads it aloud and
//               players wait. No timer. (answers_open_at is NULL.)
//   countdown — the host pressed 回答開始: a 3-2-1 "ready" before answers open.
//   answering — answers_open_at has passed; the answer timer is running.
// secondsUntil counts down to answers_open_at.
export const COUNTDOWN_S = 3;
export type RoundPhase = "await" | "countdown" | "answering" | null;

function secondsUntil(deadlineIso: string | null, offsetMs: number): number {
  if (!deadlineIso) return 0;
  const deadline = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadline)) return 0;
  const serverNow = Date.now() + offsetMs;
  return Math.max(0, Math.ceil((deadline - serverNow) / 1000));
}

type GameViewState = {
  state: GameState;
  position: number;
  question: GameQuestion | null;
  deadline: string | null;
  answersOpenAt: string | null;
  counts: VoteCounts;
  total: number;
  correctKey: string | undefined;
  correctCount: number;
  leaderboard: LeaderboardEntry[];
  roster: RosterEntry[];
  pin: string | null;
  hydrated: boolean;
  notFound: boolean;
  registrationLocked: boolean;
  hasNext: boolean;
  isDemo: boolean;
  offset: number;
};

type GameViewAction =
  | { type: "snapshot"; snap: GameSnapshot }
  | { type: "phase"; event: PhaseEvent }
  | { type: "question"; event: QuestionEvent }
  | { type: "vote"; event: VoteEvent }
  | { type: "reveal"; event: RevealEvent }
  | { type: "scoreboard"; event: ScoreboardEvent }
  | { type: "lock"; event: LockEvent }
  | { type: "pin"; pin: string | null }
  | { type: "notFound"; notFound: boolean }
  | { type: "correctKey"; key: string | undefined };

const initialGameView: GameViewState = {
  state: "lobby",
  position: 0,
  question: null,
  deadline: null,
  answersOpenAt: null,
  counts: {},
  total: 0,
  correctKey: undefined,
  correctCount: 0,
  leaderboard: [],
  roster: [],
  pin: null,
  hydrated: false,
  notFound: false,
  registrationLocked: false,
  hasNext: false,
  isDemo: false,
  offset: 0,
};

function gameViewReducer(view: GameViewState, action: GameViewAction): GameViewState {
  switch (action.type) {
    case "snapshot": {
      const { snap } = action;
      return {
        ...view,
        state: snap.state,
        position: snap.current_position,
        question: toQuestion(snap.current_question),
        deadline: snap.phase_deadline,
        answersOpenAt: snap.answers_open_at ?? null,
        counts: snap.vote?.counts ?? {},
        total: snap.vote?.total ?? 0,
        correctKey: undefined,
        correctCount: snap.correct_count ?? 0,
        leaderboard: snap.leaderboard ?? [],
        roster: snap.roster ?? [],
        registrationLocked: snap.registration_locked ?? false,
        hasNext: snap.has_next ?? false,
        isDemo: snap.is_demo ?? false,
        offset: computeOffset(snap.server_now),
        hydrated: true,
        notFound: false,
      };
    }
    case "phase": {
      const p = action.event;
      const next: GameViewState = {
        ...view,
        hydrated: true,
        state: p.state,
        position: typeof p.position === "number" ? p.position : view.position,
        deadline: p.deadline ?? null,
        answersOpenAt: p.answers_open_at ?? null,
        offset: p.server_now ? computeOffset(p.server_now) : view.offset,
      };
      if (p.state === "question_open") {
        next.correctKey = undefined;
        next.correctCount = 0;
        next.counts = {};
        next.total = 0;
      }
      return next;
    }
    case "question": {
      const q = action.event;
      return {
        ...view,
        hydrated: true,
        question: {
          position: q.position,
          eyebrow: q.eyebrow,
          text: q.text,
          choices: q.choices,
          time_limit_seconds: q.time_limit_seconds,
          points_base: q.points_base ?? 1000,
          media_url: q.media_url ?? null,
        },
        position: q.position,
        correctKey: undefined,
        correctCount: 0,
        counts: {},
        total: 0,
      };
    }
    case "vote":
      return {
        ...view,
        counts: action.event.counts ?? {},
        total: action.event.total ?? 0,
      };
    case "reveal":
      return {
        ...view,
        state: "reveal",
        counts: action.event.counts ?? {},
        total: action.event.total ?? 0,
        correctCount: action.event.correct_count ?? 0,
        leaderboard: action.event.leaderboard ?? [],
      };
    case "scoreboard":
      return { ...view, leaderboard: action.event.leaderboard ?? [] };
    case "lock":
      return {
        ...view,
        registrationLocked: Boolean(action.event.registration_locked),
        offset: action.event.server_now ? computeOffset(action.event.server_now) : view.offset,
      };
    case "pin":
      return { ...view, pin: action.pin };
    case "notFound":
      return { ...view, notFound: action.notFound };
    case "correctKey":
      return { ...view, correctKey: action.key };
  }
}

export function useGameState(gameId: string): UseGameState {
  const [view, dispatch] = useReducer(gameViewReducer, initialGameView);
  const [presence, setPresence] = useState<RawPresenceState>({});
  const [snapshotNonce, setSnapshotNonce] = useState(0);

  const refresh = () => setSnapshotNonce((n) => n + 1);

  // Drumroll 溜め: hold the correct answer until the server's answer_reveal_at so
  // the reveal lands in sync on every device (no second RPC). `correctKey` (the
  // display gate) is only set when this timer fires. Passing a falsy key clears
  // any pending timer (new question / phase reset).
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestServerTimeRef = useRef(0);
  useEffect(
    () => () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    },
    [],
  );

  // `secondsLeft` is DERIVED at render time from `deadline` + offset (below).
  // The interval below only bumps `tick` to force a recompute each second; we
  // never store the seconds value in state, which avoids setState-in-effect.
  const [tick, setTick] = useState(0);

  const acceptServerEvent = (serverNowIso: string | null | undefined): boolean => {
    if (!serverNowIso) return true;
    const serverTime = new Date(serverNowIso).getTime();
    if (Number.isNaN(serverTime)) return true;
    if (serverTime < latestServerTimeRef.current) return false;
    latestServerTimeRef.current = serverTime;
    return true;
  };

  // Bind ALL listeners (broadcast + presence) on the freshly-created channel,
  // BEFORE subscribe(). useRealtimeChannel keeps the latest binder in a ref so
  // render-only function identity changes never recreate the socket.
  const bind = (ch: RealtimeChannel) => {
    const onPhase = (payload: { payload: PhaseEvent }) => {
      const p = payload.payload;
      if (!acceptServerEvent(p.server_now)) return;
      dispatch({ type: "phase", event: p });
      // Re-pull the snapshot when the game's quiz may have changed underneath us
      // so has_next / roster are fresh: returning to the lobby (chain advance or
      // reset), and opening the FIRST question (a demo prepend swaps the quiz on
      // lobby → Q1, so has_next flips to true here, before the demo's ended screen).
      if (p.state === "lobby" || (p.state === "question_open" && p.position === 0)) {
        setSnapshotNonce((n) => n + 1);
      }
      if (p.state === "question_open") {
        scheduleCorrectReveal(revealTimerRef, dispatch, undefined, null, null);
      }
      setTick((t) => t + 1);
    };

    const onQuestion = (payload: { payload: QuestionEvent }) => {
      const q = payload.payload;
      dispatch({ type: "question", event: q });
      scheduleCorrectReveal(revealTimerRef, dispatch, undefined, null, null);
    };

    const onVote = (payload: { payload: VoteEvent }) => {
      dispatch({ type: "vote", event: payload.payload });
    };

    const onReveal = (payload: { payload: RevealEvent }) => {
      const r = payload.payload;
      if (!acceptServerEvent(r.server_now)) return;
      // Hold the answer until answer_reveal_at (drumroll climax); counts/leaderboard
      // are only shown alongside the answer, so they can land immediately.
      scheduleCorrectReveal(revealTimerRef, dispatch, r.correct_key, r.answer_reveal_at ?? null, r.server_now ?? null);
      dispatch({ type: "reveal", event: r });
    };

    const onScoreboard = (payload: { payload: ScoreboardEvent }) => {
      dispatch({ type: "scoreboard", event: payload.payload });
    };

    // `lock` — host toggled registration; reflect it live (no reload needed).
    const onLock = (payload: { payload: LockEvent }) => {
      dispatch({ type: "lock", event: payload.payload });
    };

    ch.on(REALTIME_LISTEN_TYPES.BROADCAST, { event: GAME_EVENTS.phase }, onPhase)
      .on(REALTIME_LISTEN_TYPES.BROADCAST, { event: GAME_EVENTS.question }, onQuestion)
      .on(REALTIME_LISTEN_TYPES.BROADCAST, { event: GAME_EVENTS.vote }, onVote)
      .on(REALTIME_LISTEN_TYPES.BROADCAST, { event: GAME_EVENTS.reveal }, onReveal)
      .on(REALTIME_LISTEN_TYPES.BROADCAST, { event: GAME_EVENTS.scoreboard }, onScoreboard)
      .on(REALTIME_LISTEN_TYPES.BROADCAST, { event: GAME_EVENTS.lock }, onLock);

    // Presence (lobby roster) — MUST be bound before subscribe().
    const syncPresence = () =>
      setPresence(ch.presenceState() as unknown as RawPresenceState);
    ch.on(REALTIME_LISTEN_TYPES.PRESENCE, { event: REALTIME_PRESENCE_LISTEN_EVENTS.SYNC }, syncPresence)
      .on(REALTIME_LISTEN_TYPES.PRESENCE, { event: REALTIME_PRESENCE_LISTEN_EVENTS.JOIN }, syncPresence)
      .on(REALTIME_LISTEN_TYPES.PRESENCE, { event: REALTIME_PRESENCE_LISTEN_EVENTS.LEAVE }, syncPresence);
  };

  // Own the single private channel; reconnectNonce bumps drive snapshot re-pulls.
  const { channel, status, reconnectNonce } = useRealtimeChannel(gameId, bind);

  // --- Authoritative snapshot pull (mount + reconnect + explicit refresh) ------
  useEffect(() => {
    if (!gameId) return;
    const supabase = createClient();
    let cancelled = false;

    const pull = async (): Promise<void> => {
      try {
        const [snapshotRes, pinRes] = await Promise.all([
          getGameSnapshotAction(gameId),
          getGamePinAction(gameId),
        ]);
        if (cancelled) return;
        if (pinRes.ok) dispatch({ type: "pin", pin: pinRes.pin });
        if (!snapshotRes.ok) {
          if (snapshotRes.error) {
            console.warn("[useGameState] snapshot failed", snapshotRes.error);
            // Terminal: the game row is gone (deleted / bad id / cleaned up by
            // retention). Surface it so the screen can leave instead of looping
            // forever on snapshot-fail + channel "Unauthorized".
            if (/game not found|ゲームが見つかりません/i.test(snapshotRes.error)) {
              dispatch({ type: "notFound", notFound: true });
            }
          }
          return;
        }
        const snap = snapshotRes.snapshot;
        acceptServerEvent(snap.server_now);
        dispatch({ type: "snapshot", snap });
        scheduleCorrectReveal(revealTimerRef, dispatch, snap.correct_key ?? undefined, snap.answer_reveal_at ?? null, snap.server_now);
      } catch (e) {
        if (cancelled) return;
        console.warn("[useGameState] snapshot pull threw", e);
      }
    };

    void pull();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        void pull();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [gameId, reconnectNonce, snapshotNonce]);

  // --- Local countdown ticking ----------------------------------------------
  // While a future deadline exists, bump `tick` ~4x/sec. The actual seconds value
  // is DERIVED below from the absolute deadline + offset, so it self-corrects
  // against drift and we never call setState with the computed seconds here.
  useEffect(() => {
    if (!view.deadline) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [view.deadline]);

  // Recovery guard for missed/out-of-order realtime after reveal. If the UI is
  // still in the withheld-answer drumroll past the reveal window, pull the
  // authoritative snapshot once. This is not polling; it only fires for a stuck
  // "正解は...?" state and lets the DB SSOT converge the client.
  useEffect(() => {
    if (view.state !== "reveal") return;
    if (view.correctKey) return;
    const id = setTimeout(
      () => setSnapshotNonce((n) => n + 1),
      DRUMROLL_MS + DRUMROLL_STUCK_RECOVERY_GRACE_MS,
    );
    return () => clearTimeout(id);
  }, [view.state, view.correctKey, view.position]);

  // Derived countdown: recomputed every render (and every tick / deadline / offset
  // change). `tick` participates so the interval-driven re-renders pick up the
  // new value as wall-clock time advances.
  void tick;
  const secondsLeft = secondsUntil(view.deadline, view.offset);
  const secondsUntilAnswers = secondsUntil(view.answersOpenAt, view.offset);
  let roundPhase: RoundPhase = null;
  let countdownNumber = 0;
  if (view.state === "question_open") {
    if (!view.answersOpenAt) {
      // Host hasn't opened answers yet — the question is parked for reading.
      roundPhase = "await";
    } else if (secondsUntilAnswers > 0) {
      // 回答開始 pressed → the 3-2-1 ready countdown before answers open.
      roundPhase = "countdown";
      countdownNumber = Math.max(1, Math.min(COUNTDOWN_S, secondsUntilAnswers));
    } else {
      roundPhase = "answering";
    }
  }

  return {
    state: view.state,
    position: view.position,
    question: view.question,
    deadline: view.deadline,
    secondsLeft,
    answersOpenAt: view.answersOpenAt,
    secondsUntilAnswers,
    roundPhase,
    countdownNumber,
    counts: view.counts,
    total: view.total,
    correctKey: view.correctKey,
    revealed: view.state === "reveal",
    correctCount: view.correctCount,
    leaderboard: view.leaderboard,
    roster: view.roster,
    pin: view.pin,
    hydrated: view.hydrated,
    notFound: view.notFound,
    registrationLocked: view.registrationLocked,
    hasNext: view.hasNext,
    isDemo: view.isDemo,
    channel,
    channelStatus: status,
    subscribed: status === "subscribed",
    presence,
    refresh,
  };
}

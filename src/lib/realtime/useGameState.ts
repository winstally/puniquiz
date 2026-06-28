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

import { use, useCallback, useEffect, useState } from "react";
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
  /** Registration lock — true when the host has stopped new players joining. */
  registrationLocked: boolean;
  /** A next quiz is queued — once ended, the host can continue the same game. */
  hasNext: boolean;
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

// Lead before answering — a 3s countdown + 5s question-reading window (must
// match host_advance's 8s lead in 0007). secondsUntil counts down to answers_open_at.
export const COUNTDOWN_S = 3;
export const READING_S = 5;
export type RoundPhase = "countdown" | "reading" | "answering" | null;

function secondsUntil(deadlineIso: string | null, offsetMs: number): number {
  if (!deadlineIso) return 0;
  const deadline = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadline)) return 0;
  const serverNow = Date.now() + offsetMs;
  return Math.max(0, Math.ceil((deadline - serverNow) / 1000));
}

function applySnapshot(
  snap: GameSnapshot,
  setters: {
    setOffset: (n: number) => void;
    setState: (s: GameState) => void;
    setPosition: (n: number) => void;
    setQuestion: (q: GameQuestion | null) => void;
    setDeadline: (d: string | null) => void;
    setAnswersOpenAt: (d: string | null) => void;
    setCounts: (c: VoteCounts) => void;
    setTotal: (n: number) => void;
    setCorrectKey: (k: string | undefined) => void;
    setLeaderboard: (l: LeaderboardEntry[]) => void;
    setRoster: (r: RosterEntry[]) => void;
    setHydrated: (h: boolean) => void;
    setRegistrationLocked: (b: boolean) => void;
    setHasNext: (b: boolean) => void;
  },
) {
  setters.setOffset(computeOffset(snap.server_now));
  setters.setState(snap.state);
  setters.setPosition(snap.current_position);
  setters.setQuestion(toQuestion(snap.current_question));
  setters.setDeadline(snap.phase_deadline);
  setters.setAnswersOpenAt(snap.answers_open_at ?? null);
  setters.setCounts(snap.vote?.counts ?? {});
  setters.setTotal(snap.vote?.total ?? 0);
  setters.setCorrectKey(snap.correct_key ?? undefined);
  setters.setLeaderboard(snap.leaderboard ?? []);
  setters.setRoster(snap.roster ?? []);
  setters.setRegistrationLocked(snap.registration_locked ?? false);
  setters.setHasNext(snap.has_next ?? false);
  setters.setHydrated(true);
}

export function useGameState(gameId: string): UseGameState {
  const [state, setState] = useState<GameState>("lobby");
  const [position, setPosition] = useState(0);
  const [question, setQuestion] = useState<GameQuestion | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [answersOpenAt, setAnswersOpenAt] = useState<string | null>(null);
  const [counts, setCounts] = useState<VoteCounts>({});
  const [total, setTotal] = useState(0);
  const [correctKey, setCorrectKey] = useState<string | undefined>(undefined);
  const [correctCount, setCorrectCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [pin, setPin] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [registrationLocked, setRegistrationLocked] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [presence, setPresence] = useState<RawPresenceState>({});
  const [snapshotNonce, setSnapshotNonce] = useState(0);

  const refresh = useCallback(() => setSnapshotNonce((n) => n + 1), []);

  // Clock offset (server − client) in ms, refined on every snapshot/phase.
  // It's state (not a ref) because `secondsLeft` is derived from it during
  // render — refs can't be read during render under React Compiler.
  const [offset, setOffset] = useState(0);
  // `secondsLeft` is DERIVED at render time from `deadline` + offset (below).
  // The interval below only bumps `tick` to force a recompute each second; we
  // never store the seconds value in state, which avoids setState-in-effect.
  const [tick, setTick] = useState(0);

  // Bind ALL listeners (broadcast + presence) on the freshly-created channel,
  // BEFORE subscribe(). Stable (only closes over stable setters) so it never
  // forces the channel to be recreated. Handlers only mutate the fields they own.
  const bind = useCallback((ch: RealtimeChannel) => {
    const markHydrated = () => setHydrated(true);

    const onPhase = (payload: { payload: PhaseEvent }) => {
      const p = payload.payload;
      markHydrated();
      if (p.server_now) setOffset(computeOffset(p.server_now));
      setState(p.state);
      // Re-pull the snapshot when the game's quiz may have changed underneath us
      // so has_next / roster are fresh: returning to the lobby (chain advance or
      // reset), and opening the FIRST question (a demo prepend swaps the quiz on
      // lobby → Q1, so has_next flips to true here, before the demo's ended screen).
      if (p.state === "lobby" || (p.state === "question_open" && p.position === 0)) {
        setSnapshotNonce((n) => n + 1);
      }
      if (typeof p.position === "number") setPosition(p.position);
      setDeadline(p.deadline ?? null);
      setAnswersOpenAt(p.answers_open_at ?? null);
      if (p.state === "question_open") {
        setCorrectKey(undefined);
        setCorrectCount(0);
        setCounts({});
        setTotal(0);
      }
      setTick((t) => t + 1);
    };

    const onQuestion = (payload: { payload: QuestionEvent }) => {
      markHydrated();
      const q = payload.payload;
      setQuestion({
        position: q.position,
        eyebrow: q.eyebrow,
        text: q.text,
        choices: q.choices,
        time_limit_seconds: q.time_limit_seconds,
        media_url: q.media_url ?? null,
      });
      setPosition(q.position);
      setCorrectKey(undefined);
      setCorrectCount(0);
      setCounts({});
      setTotal(0);
    };

    const onVote = (payload: { payload: VoteEvent }) => {
      const v = payload.payload;
      setCounts(v.counts ?? {});
      setTotal(v.total ?? 0);
    };

    const onReveal = (payload: { payload: RevealEvent }) => {
      const r = payload.payload;
      setCorrectKey(r.correct_key);
      setCounts(r.counts ?? {});
      setTotal(r.total ?? 0);
      setCorrectCount(r.correct_count ?? 0);
      setLeaderboard(r.leaderboard ?? []);
      setState("reveal");
    };

    const onScoreboard = (payload: { payload: ScoreboardEvent }) => {
      setLeaderboard(payload.payload.leaderboard ?? []);
    };

    // `lock` — host toggled registration; reflect it live (no reload needed).
    const onLock = (payload: { payload: LockEvent }) => {
      const l = payload.payload;
      if (l.server_now) setOffset(computeOffset(l.server_now));
      setRegistrationLocked(Boolean(l.registration_locked));
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
  }, []);

  // Own the single private channel; reconnectNonce bumps drive snapshot re-pulls.
  const { channel, status, reconnectNonce } = useRealtimeChannel(gameId, bind);

  // --- Authoritative snapshot pull (mount + reconnect + explicit refresh) ------
  useEffect(() => {
    if (!gameId) return;
    const supabase = createClient();
    let cancelled = false;

    const pull = async (): Promise<void> => {
      try {
        const [{ data, error }, gameRes] = await Promise.all([
          supabase.rpc("get_game_snapshot", { p_game_id: gameId }),
          supabase.from("games").select("pin").eq("id", gameId).maybeSingle(),
        ]);
        if (cancelled) return;
        if (!gameRes.error && gameRes.data) setPin(gameRes.data.pin);
        if (error || !data) {
          if (error)
            console.warn("[useGameState] snapshot failed", error.message);
          return;
        }
        applySnapshot(data as unknown as GameSnapshot, {
          setOffset,
          setState,
          setPosition,
          setQuestion,
          setDeadline,
          setAnswersOpenAt,
          setCounts,
          setTotal,
          setCorrectKey,
          setLeaderboard,
          setRoster,
          setHydrated,
          setRegistrationLocked,
          setHasNext,
        });
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
    if (!deadline) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [deadline]);

  // Derived countdown: recomputed every render (and every tick / deadline / offset
  // change). `tick` participates so the interval-driven re-renders pick up the
  // new value as wall-clock time advances.
  void tick;
  const secondsLeft = secondsUntil(deadline, offset);
  const secondsUntilAnswers = secondsUntil(answersOpenAt, offset);
  let roundPhase: RoundPhase = null;
  let countdownNumber = 0;
  if (state === "question_open") {
    if (answersOpenAt && secondsUntilAnswers > 0) {
      if (secondsUntilAnswers > READING_S) {
        roundPhase = "countdown";
        countdownNumber = Math.max(1, Math.min(COUNTDOWN_S, secondsUntilAnswers - READING_S));
      } else {
        roundPhase = "reading";
      }
    } else {
      roundPhase = "answering";
    }
  }

  return {
    state,
    position,
    question,
    deadline,
    secondsLeft,
    answersOpenAt,
    secondsUntilAnswers,
    roundPhase,
    countdownNumber,
    counts,
    total,
    correctKey,
    revealed: state === "reveal",
    correctCount,
    leaderboard,
    roster,
    pin,
    hydrated,
    registrationLocked,
    hasNext,
    channel,
    channelStatus: status,
    subscribed: status === "subscribed",
    presence,
    refresh,
  };
}

// Helper for Client Components that receive `params` as a Promise (Next 16):
//   const { gameId } = useRouteGameId(params);
export function useRouteGameId(params: Promise<{ gameId: string }>): {
  gameId: string;
} {
  return use(params);
}

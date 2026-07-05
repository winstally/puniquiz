"use client";

// HostController — the host big-screen realtime island for /host/[gameId].
//
// Composes the authoritative client hooks (all owned by src/lib/realtime/*):
//   - useRealtimeChannel(gameId): the single private `game:{id}` channel +
//                                 reconnectNonce (bumped on every (re)subscribe).
//   - useGameState(gameId, channel, nonce): server-authoritative phase / question
//                                 / vote / reveal; secondsLeft from the deadline.
//   - usePresence(channel, me):   live lobby roster + connected player count.
//   - useHostController(gameId): race-safe host server actions.
//
// It maps that state onto the existing <HostScreen/> via the plan's adapter:
//   votes     = choices.map(c => counts[c.key] ?? 0)
//   seconds   = secondsLeft        totalSeconds = question.timeLimitSeconds
//   revealed  = state === "reveal"
//   correctId = revealed ? choices.findIndex(key === correctKey) : -1
//   eyebrow   = `Q${position + 1}`
//   roster/count ← presence (host excluded; usePresence filters kind==="player")
//
// Lobby / scoreboard / ended are rendered as their own host views; the question
// board (HostScreen) is shown only while a round is in flight or revealed. A
// host-only control bar (start / lock / reveal / next) drives the state machine.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Lock, LockOpen, LogOut, Play, Trophy } from "lucide-react";
import { createGameAction } from "@/app/actions";
import { hydrateChoices } from "@/lib/quiz";
import { pageShell } from "@/lib/layout";
import { DRUMROLL_MS } from "@/lib/reveal-timing";
import { COUNTDOWN_S, useGameState } from "@/lib/realtime/useGameState";
import { usePresence, type PresenceMeta } from "@/lib/realtime/usePresence";
import { useHostController } from "@/lib/realtime/useHostController";
import type { RosterAvatar } from "@/components/HostScreen";
import { HostScreen, PlayerRow } from "@/components/HostScreen";
import { HostSounds } from "@/components/HostSounds";
import { HostRevealSuspense } from "@/components/HostRevealSuspense";
import { JoinQr } from "@/components/JoinQr";
import { PuniButton } from "@/components/PuniButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  LobbyBody,
  LobbyHeader,
  LobbyHeroGlow,
  LobbyWaitingHeading,
} from "@/components/LobbyUi";
import { softPillStyle } from "@/components/lobby-styles";
import { avatarColor, avatarInitial } from "@/lib/avatar";
import { Leaderboard } from "@/components/Leaderboard";

export function HostController({
  gameId,
  initialPin = null,
}: {
  gameId: string;
  initialPin?: string | null;
}) {
  // --- Host identity for presence (kind:"host" so it isn't counted) ----------
  const me: PresenceMeta = {
    player_id: `host:${gameId}`,
    nickname: "ホスト",
    avatar_color: "var(--plum)",
    avatar_initial: "H",
    kind: "host",
  };

  // --- Realtime + authoritative state ----------------------------------------
  // useGameState owns the single private channel internally and exposes it for
  // presence; we must NOT create a second channel here.
  const game = useGameState(gameId);
  const displayPin = game.pin ?? initialPin;
  const presence = usePresence(game.channel, me, game.presence, game.subscribed);
  const host = useHostController(gameId, true);

  // --- Derived adapter values ------------------------------------------------
  const { counts, secondsLeft, correctKey, state, position } = game;
  const lobbyReady = state !== "lobby" || Boolean(displayPin);
  // Hydrate the public {key,label} choices into render-ready Choice[] (color/
  // shape/art come from the static CHOICE_THEME — the single visual adapter).
  const choices = game.question ? hydrateChoices(game.question.choices) : [];
  const votes = choices.map((c) => counts[c.key] ?? 0);
  const revealed = state === "reveal";
  const correctId =
    revealed && correctKey
      ? choices.findIndex((c) => c.key === correctKey)
      : -1;
  // Server-authoritative drumroll 溜め: during reveal the server withholds
  // correct_key, so correctId stays -1 until reveal_answer broadcasts it.
  const drumrolling = revealed && correctId < 0;
  const totalSeconds = game.question?.time_limit_seconds ?? undefined;
  const eyebrow = `Q${position + 1}`;
  const countdownCueKey = game.roundPhase === "countdown" ? game.answersOpenAt : null;
  const countdownElapsedMs =
    game.roundPhase === "countdown"
      ? Math.max(0, COUNTDOWN_S * 1000 - game.msUntilAnswers)
      : 0;

  // Presence roster → HostScreen avatar chips + authoritative connected count.
  const roster: RosterAvatar[] = presence.roster.map((p) => ({
    initial: avatarInitial(p.nickname, p.avatar_initial),
    bg: avatarColor(p.avatar_color, p.player_id),
  }));
  const count = presence.count;

  const isHost = true;
  const router = useRouter();

  // The game no longer exists (deleted / stale URL / retention cleanup) — go to
  // the landing page, same as the player side, instead of looping forever on
  // "game not found" + channel "Unauthorized".
  const notFound = game.notFound;

  // End-of-game host actions: start a brand-new game (same quiz → new PIN, like
  // Kahoot) or return to the landing page.
  const [restarting, startRestart] = useTransition();
  const restart = () =>
    startRestart(async () => {
      const res = await createGameAction();
      if (res.ok) router.push(res.redirect);
      else toast.error(res.error);
    });
  const goHome = () => router.push("/");
  // Quiz chaining: when this game ended but a next quiz is queued (e.g. the demo
  // just finished), continue the SAME game with it — advance_quiz resets scores
  // and returns everyone to the lobby for the next quiz (same PIN / players).
  const advanceQuiz = () => {
    void host.advanceQuiz();
  };
  // Lobby warm-up: prepend the curated demo and open its first question. When the
  // demo ends, advance_quiz continues the SAME game with the real quiz. Decided
  // here (after players gather / registration closed), not at game creation.
  const startDemo = () => {
    void host.startDemo();
  };
  // Host quits the whole session: end it for everyone, then return home. The
  // entry point lives in the header (mirrors the player's 退出), with a confirm.
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const endGame = () => {
    void host.end().then(goHome);
  };

  // The body renders immediately with empty data (pin/roster/count fill in when
  // the snapshot lands) — no "準備中" gate. We still wait for hydration before
  // showing the host control bar, so its phase action (start/reveal/next) is right.
  const loading = !game.hydrated;

  if (notFound) {
    return (
      <main style={pageShell}>
        <p
          style={{
            margin: "48px auto",
            textAlign: "center",
            color: "var(--ink-soft)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ゲームが見つかりません。
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PuniButton variant="plum" size="md" onClick={() => router.push("/")}>
            トップに戻る
          </PuniButton>
        </div>
      </main>
    );
  }

  return (
    <main style={pageShell}>
      {/* Big-screen SFX: thinking loop while answering, drumroll on reveal. The
          reveal is now driven by the server's answer_reveal_at (client timer), so
          the drumroll is decorative — rate-synced to land exactly on the reveal. */}
      <HostSounds
        countdownCueKey={countdownCueKey}
        countdownElapsedMs={countdownElapsedMs}
        answering={game.roundPhase === "answering"}
        revealed={revealed}
        revealMs={DRUMROLL_MS}
      />
      <HostHeader
        pin={displayPin}
        roster={roster}
        count={count}
        onEndGame={isHost && state !== "ended" ? () => setShowEndConfirm(true) : undefined}
      />

      {state === "lobby" && !displayPin ? (
        <PreparingLobbyView />
      ) : state === "lobby" ? (
        <LobbyView pin={displayPin} />
      ) : state === "ended" ? (
        <Leaderboard leaderboard={game.leaderboard} final maxPoints={game.maxPoints} />
      ) : state === "scoreboard" ? (
        <Leaderboard leaderboard={game.leaderboard} final={false} maxPoints={game.maxPoints} />
      ) : drumrolling ? (
        <HostRevealSuspense />
      ) : (
        <HostScreen
          choices={choices}
          eyebrow={eyebrow}
          question={game.question?.text ?? ""}
          media={game.question?.media_url ?? null}
          votes={votes}
          seconds={secondsLeft}
          roundPhase={game.roundPhase}
          countdownNumber={game.countdownNumber}
          totalSeconds={totalSeconds}
          manual={game.question?.time_limit_seconds == null}
          correctId={correctId}
          revealed={revealed}
          correctCount={game.correctCount}
          roster={roster}
          count={count}
          points={game.question?.points_base ?? null}
          tall
        />
      )}

      {isHost && lobbyReady ? (
          <HostControls
            state={state}
            pending={host.pending || restarting}
            ready={!loading && lobbyReady}
            registrationLocked={game.registrationLocked}
            hasNext={game.hasNext}
            awaitingAnswers={game.roundPhase === "await"}
            onStart={host.start}
            onStartDemo={game.isDemo ? undefined : startDemo}
            onAdvanceQuiz={advanceQuiz}
            onNext={host.next}
            onOpenAnswers={host.openAnswers}
            onReveal={host.reveal}
            onRestart={restart}
            onHome={goHome}
            onToggleLock={host.setLock}
          />
      ) : null}

      <AnimatePresence>
        {showEndConfirm ? (
          <ConfirmDialog
            title="ゲームを中止しますか？"
            description="参加者の画面にも終了が表示され、ホームに戻ります。"
            confirmLabel="中止する"
            cancelLabel="やめる"
            pending={host.pending}
            confirmTone="rose"
            onCancel={() => setShowEndConfirm(false)}
            onConfirm={() => {
              setShowEndConfirm(false);
              endGame();
            }}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Header — logo + live participants + host controls + join code. The presence
// stack (avatars + count) lives here so it's visible on EVERY host screen (not
// just the lobby), the same PlayerRow used everywhere.
// -----------------------------------------------------------------------------
function HostHeader({
  pin,
  roster,
  count,
  onEndGame,
}: {
  pin: string | null;
  roster: RosterAvatar[];
  count: number;
  onEndGame?: () => void;
}) {
  // Order: 中止 → 人数 → コード (the JoinCodePill is appended by LobbyHeader).
  return (
    <LobbyHeader pin={pin}>
      {onEndGame ? (
        <PuniButton
          variant="soft"
          size="sm"
          tone="rose"
          icon={LogOut}
          onClick={onEndGame}
          aria-label="ゲームを中止する"
        >
          ゲームを中止
        </PuniButton>
      ) : null}
      {count > 0 ? (
        <span style={softPillStyle()}>
          <PlayerRow roster={roster} count={count} />
        </span>
      ) : null}
    </LobbyHeader>
  );
}

// -----------------------------------------------------------------------------
// Lobby — waiting room. The join CODE stays in the header (always visible); here
// the QR is the hero so players scan straight in.
// -----------------------------------------------------------------------------
function LobbyView({ pin }: { pin: string | null }) {
  return (
    <LobbyBody>
      <LobbyWaitingHeading>参加者を待っています</LobbyWaitingHeading>

      {/* Presence + join code both live in the header / QR card, so the lobby body
          is just the heading and the QR hero. */}
      <LobbyHeroGlow>
        <JoinQr pin={pin} size={420} />
      </LobbyHeroGlow>
    </LobbyBody>
  );
}

function PreparingLobbyView() {
  return (
    <LobbyBody>
      <LobbyWaitingHeading>ゲームを準備しています</LobbyWaitingHeading>
    </LobbyBody>
  );
}


// -----------------------------------------------------------------------------
// Host control bar — drives the state machine. Label adapts to the phase.
// -----------------------------------------------------------------------------
function HostControls({
  state,
  pending,
  ready,
  registrationLocked,
  hasNext,
  awaitingAnswers,
  onStart,
  onStartDemo,
  onAdvanceQuiz,
  onNext,
  onOpenAnswers,
  onReveal,
  onRestart,
  onHome,
  onToggleLock,
}: {
  state: ReturnType<typeof useGameState>["state"];
  pending: boolean;
  ready: boolean;
  registrationLocked: boolean;
  /** A next quiz is queued — the ended screen offers to continue the same game. */
  hasNext: boolean;
  /** Question is parked (await): the host hasn't opened answers yet. */
  awaitingAnswers: boolean;
  onStart: () => void;
  /** Lobby: warm up with the demo first (real quiz continues after it ends).
   *  Omitted when this game IS the demo — then no "デモから始める" option. */
  onStartDemo?: () => void;
  /** Continue the same game with the queued next quiz (e.g. demo → real). */
  onAdvanceQuiz: () => void;
  onNext: () => void;
  /** From a parked question, start the 3-2-1 countdown + open answers. */
  onOpenAnswers: () => void;
  onReveal: () => void;
  onRestart: () => void;
  onHome: () => void;
  onToggleLock: (locked: boolean) => void;
}) {
  // Confirm gate before starting (closes the lobby), so a stray tap can't kick
  // the game off. Declared before the early return below to keep hook order stable.
  const [showStartConfirm, setShowStartConfirm] = useState(false);

  // Primary action per phase:
  //  lobby           → start (host_advance: open first question) — confirm first
  //  question_open   → lock answers (host_advance) OR reveal now (reveal_round)
  //  locked          → reveal (reveal_round)
  //  reveal          → ranking (host_advance → scoreboard)
  //  scoreboard      → next question / end (host_advance)
  //  ended           → no action
  let primary: {
    label: string;
    onClick: () => void;
    confirm?: boolean;
    icon?: LucideIcon;
    iconFilled?: boolean;
  } | null = null;
  let secondary: { label: string; onClick: () => void } | null = null;

  switch (state) {
    case "lobby":
      // The start confirm offers "デモから始める" as a warm-up option (inside the
      // dialog, not a separate button) — see showStartConfirm below.
      primary = { label: "ゲーム開始", onClick: onStart, confirm: true, icon: Play, iconFilled: true };
      break;
    case "question_open":
      if (awaitingAnswers) {
        // Question is parked for reading — the host opens answers on their go.
        primary = { label: "回答開始", onClick: onOpenAnswers, icon: Play, iconFilled: true };
      } else {
        primary = { label: "正解発表", onClick: onReveal };
        secondary = { label: "回答を締め切る", onClick: onNext };
      }
      break;
    case "locked":
      primary = { label: "正解発表", onClick: onReveal };
      break;
    case "reveal":
      primary = { label: "つぎへ", onClick: onNext, icon: Trophy };
      break;
    case "scoreboard":
      primary = { label: "次の問題へ", onClick: onNext, icon: ArrowRight };
      break;
    case "ended":
      if (hasNext) {
        // A next quiz is queued (e.g. the demo just finished) → continue the
        // same game with it: same PIN, same players, fresh scores.
        primary = { label: "本番に進む →", onClick: onAdvanceQuiz };
        secondary = { label: "ホームに戻る", onClick: onHome };
      } else {
        primary = { label: "もう一度遊ぶ", onClick: onRestart };
        secondary = { label: "ホームに戻る", onClick: onHome };
      }
      break;
  }

  if (!primary && !secondary) return null;

  return (
    <>
    <div
      style={{
        position: "sticky",
        bottom: 16,
        marginTop: 28,
        display: "flex",
        gap: 12,
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      {state === "lobby" ? (
        <PuniButton
          type="button"
          variant="soft"
          size="md"
          tone={registrationLocked ? "rose" : "default"}
          icon={registrationLocked ? LockOpen : Lock}
          disabled={pending || !ready}
          onClick={() => onToggleLock(!registrationLocked)}
        >
          {registrationLocked ? "受付を再開" : "応募を締め切る"}
        </PuniButton>
      ) : null}
      {secondary ? (
        <PuniButton
          type="button"
          variant="soft"
          size="md"
          tone="plum"
          disabled={pending || !ready}
          onClick={secondary.onClick}
        >
          {secondary.label}
        </PuniButton>
      ) : null}
      {primary ? (
        <PuniButton
          type="button"
          variant="plum"
          size="lg"
          icon={!pending ? primary.icon : undefined}
          iconFilled={primary.iconFilled}
          disabled={pending || !ready}
          onClick={primary.confirm ? () => setShowStartConfirm(true) : primary.onClick}
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "…" : primary.label}
        </PuniButton>
      ) : null}
    </div>

    <AnimatePresence>
      {showStartConfirm ? (
        <ConfirmDialog
          title="締め切って開始しますか？"
          description={
            onStartDemo
              ? "ゲームを開始すると最初の問題に進みます。初めての参加者には、まずデモで操作に慣れてもらえます。"
              : "ゲームを開始すると最初の問題に進みます。"
          }
          confirmLabel="開始する"
          cancelLabel="キャンセル"
          pending={pending}
          onCancel={() => setShowStartConfirm(false)}
          onConfirm={() => {
            setShowStartConfirm(false);
            onStart();
          }}
          // No "demo" option when this game IS the demo (started via デモを試す).
          extra={
            onStartDemo
              ? {
                  label: "▷ デモから始める",
                  onClick: () => {
                    setShowStartConfirm(false);
                    onStartDemo();
                  },
                }
              : undefined
          }
        />
      ) : null}
    </AnimatePresence>

    </>
  );
}

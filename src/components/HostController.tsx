"use client";

// HostController — the host big-screen realtime island for /host/[gameId].
//
// Composes the authoritative client hooks (all owned by src/lib/realtime/*):
//   - useRealtimeChannel(gameId): the single private `game:{id}` channel +
//                                 reconnectNonce (bumped on every (re)subscribe).
//   - useGameState(gameId, channel, nonce): server-authoritative phase / question
//                                 / vote / reveal; secondsLeft from the deadline.
//   - usePresence(channel, me):   live lobby roster + connected player count.
//   - useHostController(gameId, hostSecret): race-safe host_advance / reveal_round.
//
// It maps that state onto the existing <HostScreen/> via the plan's adapter:
//   votes     = choices.map(c => counts[c.key] ?? 0)
//   seconds   = secondsLeft        totalSeconds = question.timeLimitSeconds
//   revealed  = state === "reveal"
//   correctId = revealed ? choices.findIndex(key === correctKey) : -1
//   eyebrow   = `Q${position + 1}`
//   roster/count ← presence (host excluded; usePresence filters role==="player")
//
// Lobby / scoreboard / ended are rendered as their own host views; the question
// board (HostScreen) is shown only while a round is in flight or revealed. A
// host-only control bar (start / lock / reveal / next) drives the state machine.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Lock, LockOpen, LogOut, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createGameAction } from "@/app/actions";
import { hydrateChoices } from "@/lib/quiz";
import { pageShell } from "@/lib/layout";
import { useGameState } from "@/lib/realtime/useGameState";
import { usePresence, type PresenceMeta } from "@/lib/realtime/usePresence";
import { useHostController } from "@/lib/realtime/useHostController";
import type { RosterAvatar } from "@/components/HostScreen";
import { HostScreen } from "@/components/HostScreen";
import { JoinQr } from "@/components/JoinQr";
import { PuniButton } from "@/components/PuniButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  LobbyBody,
  LobbyHeader,
  LobbyHeroGlow,
  LobbyWaitingHeading,
  PresencePill,
} from "@/components/LobbyUi";
import { avatarColor, avatarInitial } from "@/lib/avatar";
import { Podium } from "@/components/Podium";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { readHostSecret } from "@/app/host/[gameId]/host-secret-action";

export function HostController({ gameId }: { gameId: string }) {
  // --- Host bearer secret (httpOnly cookie → server action) ------------------
  const [hostSecret, setHostSecret] = useState<string | null>(null);
  const [secretResolved, setSecretResolved] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void readHostSecret(gameId).then((secret) => {
      if (cancelled) return;
      setHostSecret(secret);
      setSecretResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // --- Host identity for presence (role:"host" so it isn't counted) ----------
  const [me, setMe] = useState<PresenceMeta | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      // Stable presence id for the host screen of this game.
      const uid = data.user?.id ?? "anon";
      setMe({
        player_id: `host:${gameId}:${uid}`,
        nickname: "ホスト",
        avatar_color: "var(--plum)",
        avatar_initial: "H",
        role: "host",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // --- Realtime + authoritative state ----------------------------------------
  // useGameState owns the single private channel internally and exposes it for
  // presence; we must NOT create a second channel here.
  const game = useGameState(gameId);
  const presence = usePresence(game.channel, me, game.presence, game.subscribed);
  const host = useHostController(gameId, hostSecret);

  // --- Derived adapter values ------------------------------------------------
  const { counts, secondsLeft, correctKey, state, position } = game;
  // Hydrate the public {key,label} choices into render-ready Choice[] (color/
  // shape/art come from the static CHOICE_THEME — the single visual adapter).
  const choices = game.question ? hydrateChoices(game.question.choices) : [];
  const votes = choices.map((c) => counts[c.key] ?? 0);
  const revealed = state === "reveal";
  const correctId =
    revealed && correctKey
      ? choices.findIndex((c) => c.key === correctKey)
      : -1;
  const totalSeconds = game.question?.time_limit_seconds ?? undefined;
  const eyebrow = `Q${position + 1}`;

  // Presence roster → HostScreen avatar chips + authoritative connected count.
  const roster: RosterAvatar[] = presence.roster.map((p) => ({
    initial: avatarInitial(p.nickname, p.avatar_initial),
    bg: avatarColor(p.avatar_color, p.player_id),
  }));
  const count = presence.count;

  // Toast each time a new player joins. The first observation seeds the "seen"
  // set silently (so we don't announce players already present, e.g. after a
  // host reconnect / late open); only genuinely-new player_ids toast after that.
  const seenPlayersRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const here = presence.roster;
    if (seenPlayersRef.current === null) {
      seenPlayersRef.current = new Set(here.map((p) => p.player_id));
      return;
    }
    const seen = seenPlayersRef.current;
    for (const p of here) {
      if (seen.has(p.player_id)) continue;
      seen.add(p.player_id);
      toast.success(`${p.nickname || "ゲスト"}さんが参加しました 🎉`);
    }
  }, [presence.roster]);

  const isHost = secretResolved && Boolean(hostSecret);
  const isSpectator = secretResolved && !hostSecret;
  const router = useRouter();

  // No host cookie → this URL isn't for them; send to join flow on the landing page.
  useEffect(() => {
    if (!isSpectator) return;

    const redirect = () => {
      const href = game.pin ? `/?join=${encodeURIComponent(game.pin)}` : "/";
      router.replace(href);
    };

    if (game.pin || game.hydrated) {
      redirect();
      return;
    }

    const id = window.setTimeout(redirect, 1500);
    return () => window.clearTimeout(id);
  }, [isSpectator, game.pin, game.hydrated, router]);

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

  if (isSpectator) {
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
          参加ページへ移動しています…
        </p>
      </main>
    );
  }

  return (
    <main style={pageShell}>
      <HostHeader
        status={game.channelStatus}
        count={count}
        roster={roster}
        onEndGame={isHost && state !== "ended" ? () => setShowEndConfirm(true) : undefined}
      />

      {state === "lobby" ? (
        <LobbyView pin={game.pin} />
      ) : state === "ended" ? (
        <Podium leaderboard={game.leaderboard} />
      ) : state === "scoreboard" ? (
        <ScoreboardView leaderboard={game.leaderboard} ended={false} />
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
          correctId={correctId}
          revealed={revealed}
          roster={roster}
          count={count}
        />
      )}

      {secretResolved && isHost ? (
          <HostControls
            state={state}
            pending={host.pending || restarting}
            ready={!loading}
            registrationLocked={game.registrationLocked}
            hasNext={game.hasNext}
            onStart={host.start}
            onStartDemo={startDemo}
            onAdvanceQuiz={advanceQuiz}
            onNext={host.next}
            onReveal={host.reveal}
            onRestart={restart}
            onHome={goHome}
            onToggleLock={host.setLock}
            onResetToLobby={host.resetToLobby}
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
// Header — logo + (optional) PIN + live connection state.
// -----------------------------------------------------------------------------
function HostHeader({
  status,
  count,
  roster,
  onEndGame,
}: {
  status: string;
  count: number;
  roster: RosterAvatar[];
  onEndGame?: () => void;
}) {
  return (
    <LobbyHeader>
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
      <PresencePill status={status} roster={roster} count={count} />
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
      <LobbyHeroGlow>
        <JoinQr pin={pin} size={420} />
      </LobbyHeroGlow>
    </LobbyBody>
  );
}

// -----------------------------------------------------------------------------
// Scoreboard / final results — leaderboard between rounds and at game end.
// -----------------------------------------------------------------------------
function ScoreboardView({
  leaderboard,
  ended,
}: {
  leaderboard: ReturnType<typeof useGameState>["leaderboard"];
  ended: boolean;
}) {
  const medals = ["#ffc24d", "#cfd6e6", "#e8a06a"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 560, margin: "0 auto", padding: "16px 0 8px" }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(24px,3vw,34px)",
          margin: 0,
          textAlign: "center",
          color: "var(--ink)",
        }}
      >
        {ended ? "最終ランキング" : "ランキング"}
      </h2>
      {leaderboard.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--ink-soft)", fontWeight: 500 }}>まだスコアがありません</p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {leaderboard.map((entry, i) => (
            <li
              key={entry.player_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: "#fff",
                borderRadius: 18,
                padding: "12px 18px",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: medals[i] ?? "color-mix(in srgb, var(--plum) 12%, white)",
                  color: i < 3 ? "#fff" : "var(--plum-deep)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 15,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {i + 1}
              </span>
              <PlayerAvatar
                nickname={entry.nickname}
                initial={entry.avatar_initial}
                color={entry.avatar_color}
                colorSeed={entry.player_id}
                size="lg"
              />
              <span style={{ flex: 1, fontWeight: 700, color: "var(--ink)", fontSize: 16 }}>{entry.nickname}</span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 18,
                  color: "var(--plum)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {entry.total_points}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
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
  onStart,
  onStartDemo,
  onAdvanceQuiz,
  onNext,
  onReveal,
  onRestart,
  onHome,
  onToggleLock,
  onResetToLobby,
}: {
  state: ReturnType<typeof useGameState>["state"];
  pending: boolean;
  ready: boolean;
  registrationLocked: boolean;
  /** A next quiz is queued — the ended screen offers to continue the same game. */
  hasNext: boolean;
  onStart: () => void;
  /** Lobby: warm up with the demo first (real quiz continues after it ends). */
  onStartDemo: () => void;
  /** Continue the same game with the queued next quiz (e.g. demo → real). */
  onAdvanceQuiz: () => void;
  onNext: () => void;
  onReveal: () => void;
  onRestart: () => void;
  onHome: () => void;
  onToggleLock: (locked: boolean) => void;
  onResetToLobby: () => void;
}) {
  // Confirm gate before starting (closes the lobby), so a stray tap can't kick
  // the game off. Declared before the early return below to keep hook order stable.
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const inGame =
    state === "question_open" ||
    state === "locked" ||
    state === "reveal" ||
    state === "scoreboard";

  // Primary action per phase:
  //  lobby           → start (host_advance: open first question) — confirm first
  //  question_open   → lock answers (host_advance) OR reveal now (reveal_round)
  //  locked          → reveal (reveal_round)
  //  reveal          → next (host_advance → scoreboard)
  //  scoreboard      → next question / end (host_advance)
  //  ended           → no action
  let primary: { label: string; onClick: () => void; confirm?: boolean } | null = null;
  let secondary: { label: string; onClick: () => void } | null = null;

  switch (state) {
    case "lobby":
      // The start confirm offers "デモから始める" as a warm-up option (inside the
      // dialog, not a separate button) — see showStartConfirm below.
      primary = { label: "ゲーム開始", onClick: onStart, confirm: true };
      break;
    case "question_open":
      primary = { label: "正解発表", onClick: onReveal };
      secondary = { label: "回答を締め切る", onClick: onNext };
      break;
    case "locked":
      primary = { label: "正解発表", onClick: onReveal };
      break;
    case "reveal":
      primary = { label: "次へ", onClick: onNext };
      break;
    case "scoreboard":
      primary = { label: "次の問題へ", onClick: onNext };
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
      {inGame ? (
        <PuniButton
          type="button"
          variant="soft"
          size="md"
          disabled={pending || !ready}
          onClick={() => setShowResetConfirm(true)}
        >
          中断してロビーへ
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
          icon={state === "lobby" && !pending ? Play : undefined}
          iconFilled={state === "lobby"}
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
          description="ゲームを開始すると最初の問題に進みます。初めての参加者には、まずデモで操作に慣れてもらえます。"
          confirmLabel="開始する"
          cancelLabel="キャンセル"
          pending={pending}
          onCancel={() => setShowStartConfirm(false)}
          onConfirm={() => {
            setShowStartConfirm(false);
            onStart();
          }}
          extra={{
            label: "▷ デモから始める",
            onClick: () => {
              setShowStartConfirm(false);
              onStartDemo();
            },
          }}
        />
      ) : null}
    </AnimatePresence>

    <AnimatePresence>
      {showResetConfirm ? (
        <ConfirmDialog
          title="中断してロビーに戻しますか？"
          description="進行中のラウンドとスコアはリセットされます。参加者はそのままです。"
          confirmLabel="ロビーに戻す"
          cancelLabel="やめる"
          pending={pending}
          confirmTone="rose"
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={() => {
            setShowResetConfirm(false);
            onResetToLobby();
          }}
        />
      ) : null}
    </AnimatePresence>
    </>
  );
}

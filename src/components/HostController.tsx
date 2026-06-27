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
//   eyebrow   = question.eyebrow ?? `Q${position + 1}`
//   roster/count ← presence (host excluded; usePresence filters role==="player")
//
// Lobby / scoreboard / ended are rendered as their own host views; the question
// board (HostScreen) is shown only while a round is in flight or revealed. A
// host-only control bar (start / lock / reveal / next) drives the state machine.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
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
  // DB questions carry a human eyebrow ("Q1 / 3"); fall back to the position.
  const eyebrow = game.question?.eyebrow ?? `Q${position + 1}`;

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
      toast(`${p.nickname || "ゲスト"}さんが参加しました 🎉`);
    }
  }, [presence.roster]);

  const isHost = secretResolved && Boolean(hostSecret);

  // End-of-game host actions: start a brand-new game (same quiz → new PIN, like
  // Kahoot) or return to the landing page.
  const router = useRouter();
  const [restarting, startRestart] = useTransition();
  const restart = () =>
    startRestart(async () => {
      const res = await createGameAction();
      if (res.ok) router.push(res.redirect);
      else toast.error(res.error);
    });
  const goHome = () => router.push("/");

  // The body renders immediately with empty data (pin/roster/count fill in when
  // the snapshot lands) — no "準備中" gate. We still wait for hydration before
  // showing the host control bar, so its phase action (start/reveal/next) is right.
  const loading = !game.hydrated;

  return (
    <main style={pageShell}>
      <HostHeader
        status={game.channelStatus}
        count={count}
        roster={roster}
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
          votes={votes}
          seconds={secondsLeft}
          totalSeconds={totalSeconds}
          correctId={correctId}
          revealed={revealed}
          roster={roster}
          count={count}
        />
      )}

      {secretResolved ? (
        isHost ? (
          <HostControls
            state={state}
            pending={host.pending || restarting}
            ready={!loading}
            registrationLocked={game.registrationLocked}
            onStart={host.start}
            onNext={host.next}
            onReveal={host.reveal}
            onRestart={restart}
            onHome={goHome}
            onToggleLock={host.setLock}
            onResetToLobby={host.resetToLobby}
          />
        ) : (
          <SpectatorNote />
        )
      ) : null}
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
}: {
  status: string;
  count: number;
  roster: RosterAvatar[];
}) {
  return (
    <LobbyHeader>
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
// ConfirmDialog — lightweight on-brand confirm modal (no Radix dep). Backdrop +
// centered card, Escape / backdrop-click to cancel. Used to gate "ゲーム開始".
// -----------------------------------------------------------------------------
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <motion.div
      role="presentation"
      onClick={onCancel}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(20,12,45,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        style={{
          width: "min(100%, 380px)",
          background: "#fff",
          borderRadius: 24,
          border: "1px solid var(--hairline)",
          boxShadow: "var(--shadow-card-lift)",
          padding: "28px 26px 22px",
          textAlign: "center",
        }}
      >
        <h3
          id="confirm-dialog-title"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 21,
            margin: "0 0 8px",
            color: "var(--ink)",
          }}
        >
          {title}
        </h3>
        {description ? (
          <p style={{ margin: "0 0 22px", color: "var(--ink-soft)", fontSize: 14, fontWeight: 500, lineHeight: 1.6 }}>
            {description}
          </p>
        ) : (
          <div style={{ height: 14 }} />
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Button
            type="button"
            onClick={onCancel}
            disabled={pending}
            style={{
              height: "auto",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 15,
              padding: "12px 22px",
              borderRadius: 999,
              background: "#fff",
              color: "var(--ink-soft)",
              border: "1px solid var(--hairline)",
              boxShadow: "var(--shadow-soft)",
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            autoFocus
            onClick={onConfirm}
            disabled={pending}
            style={{
              height: "auto",
              color: "#fff",
              border: "none",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 15,
              padding: "12px 28px",
              borderRadius: 999,
              background:
                "radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%), linear-gradient(158deg, var(--plum), var(--plum-deep))",
              boxShadow: "0 6px 0 var(--plum-deep), 0 12px 20px -8px var(--plum)",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "…" : confirmLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
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
  onStart,
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
  onStart: () => void;
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
      primary = { label: "もう一度遊ぶ", onClick: onRestart };
      secondary = { label: "ホームに戻る", onClick: onHome };
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
        <Button
          type="button"
          disabled={pending || !ready}
          onClick={() => onToggleLock(!registrationLocked)}
          style={{
            height: "auto",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15,
            padding: "13px 24px",
            borderRadius: 999,
            background: "#fff",
            color: registrationLocked ? "var(--rose-deep)" : "var(--ink-soft)",
            border: `1px solid ${
              registrationLocked
                ? "color-mix(in srgb, var(--rose) 40%, var(--hairline))"
                : "var(--hairline)"
            }`,
            boxShadow: "var(--shadow-soft)",
          }}
        >
          {registrationLocked ? "受付を再開" : "応募を締め切る"}
        </Button>
      ) : null}
      {inGame ? (
        <Button
          type="button"
          disabled={pending || !ready}
          onClick={() => setShowResetConfirm(true)}
          style={{
            height: "auto",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15,
            padding: "13px 24px",
            borderRadius: 999,
            background: "#fff",
            color: "var(--ink-soft)",
            border: "1px solid var(--hairline)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          中断してロビーへ
        </Button>
      ) : null}
      {secondary ? (
        <Button
          type="button"
          disabled={pending || !ready}
          onClick={secondary.onClick}
          style={{
            height: "auto",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15,
            padding: "13px 24px",
            borderRadius: 999,
            background: "#fff",
            color: "var(--plum-deep)",
            border: "1px solid var(--hairline)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          {secondary.label}
        </Button>
      ) : null}
      {primary ? (
        <Button
          type="button"
          disabled={pending || !ready}
          onClick={primary.confirm ? () => setShowStartConfirm(true) : primary.onClick}
          style={{
            height: "auto",
            color: "#fff",
            border: "none",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            padding: "14px 32px",
            borderRadius: 999,
            background:
              "radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%), linear-gradient(158deg, var(--plum), var(--plum-deep))",
            boxShadow: "0 6px 0 var(--plum-deep), 0 12px 20px -8px var(--plum)",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "…" : primary.label}
        </Button>
      ) : null}
    </div>

    <AnimatePresence>
      {showStartConfirm ? (
        <ConfirmDialog
          title="締め切って開始しますか？"
          description="ゲームを開始すると最初の問題に進みます。"
          confirmLabel="開始する"
          cancelLabel="キャンセル"
          pending={pending}
          onCancel={() => setShowStartConfirm(false)}
          onConfirm={() => {
            setShowStartConfirm(false);
            onStart();
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

// Shown when this browser opened /host/{id} without the host secret cookie:
// they can watch the live game but cannot drive it.
function SpectatorNote() {
  return (
    <p
      style={{
        marginTop: 28,
        textAlign: "center",
        color: "var(--ink-soft)",
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      観戦モード — このゲームのホスト権限がありません
    </p>
  );
}

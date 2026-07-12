"use client";

// PlayerSession — the player-side realtime island for /play/[gameId].
//
// Composes the two client hooks (owned by src/lib/realtime/*):
//   - useGameState(gameId): owns the private `game:{id}` channel internally and
//                           exposes server-authoritative phase/question/vote/
//                           reveal, secondsLeft from the absolute deadline, the
//                           game PIN, and correctKey (undefined until reveal).
//   - usePlayerSession(gameId): anonymous session + this game's player row, plus
//                           pick(choiceKey) with optimistic UI.
//
// It maps that state onto the existing <PhoneScreen/> via the plan's adapter:
//   choices    = hydrateChoices(question.choices)          (theme re-hydrated)
//   picked     = index of session.picked (committed key) → number | null
//   revealed   = game.revealed (state === "reveal")
//   correctId  = revealed ? choices.findIndex(key===correctKey) : -1
//   onPick     = session.pick (PhoneScreen hands us the choice KEY)
//   nickname/initial/pin injected from the real player row + game.
//
// If the visitor has no membership for this game (status "no_player"), it shows
// a small join prompt linking to "/?join={pin}" instead of the board.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { hydrateChoices } from "@/lib/quiz";
import { useGameState } from "@/lib/realtime/useGameState";
import { usePlayerSession } from "@/lib/realtime/usePlayerSession";
import { usePresence, type PresenceMeta } from "@/lib/realtime/usePresence";
import { PhoneScreen } from "@/components/PhoneScreen";
import { PuniButton } from "@/components/PuniButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const messageCardStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 16,
  textAlign: "center",
  padding: "48px 24px",
  maxWidth: 340,
  margin: "0 auto",
} as const;

const messageCardIconStyle = {
  width: 64,
  height: 64,
  borderRadius: 22,
  display: "grid",
  placeItems: "center",
  fontSize: 30,
  transform: "rotate(-6deg)",
  background: "color-mix(in srgb, var(--plum) 10%, white)",
  boxShadow: "var(--shadow-soft)",
} as const;

export function PlayerSession({ gameId }: { gameId: string }) {
  const game = useGameState(gameId);
  const answerScope = game.question ? `${game.position}:${game.question.text}` : null;
  const session = usePlayerSession(gameId, answerScope);
  const router = useRouter();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // No boot/poll loop: the realtime channel auto-(re)subscribes with backoff and
  // re-auths on token changes, and useGameState re-pulls the snapshot on every
  // (re)subscribe (reconnectNonce) + auth change. So session + snapshot converge
  // on their own — we just render the resolved state, no soft-reload churn.

  // Track this player into presence so the host's lobby roster/count updates
  // live. Built from the resolved player row (null until then → no track yet).
  const me: PresenceMeta | null = session.player
    ? {
        player_id: session.player.id,
        nickname: session.player.nickname,
        avatar_color: session.player.avatar_color,
        avatar_initial: session.player.avatar_initial,
        kind: "player",
      }
    : null;
  usePresence(game.channel, me, game.presence, game.subscribed);

  // Not a member here (deep link / lost session): there's nothing to play without
  // joining by code, so send them to the landing to enter one. The PIN is hidden
  // from non-members by RLS, so prefilling it was always dead code — just go home.
  const notMember =
    !session.loading &&
    !session.isMember &&
    session.status !== "anonymous_disabled" &&
    session.status !== "error";
  // True while the channel is connecting or has errored (reconnecting). Used to
  // surface a small, non-alarming "再接続中…" pill rather than blocking the UI.
  const connecting =
    game.channelStatus === "connecting" ||
    game.channelStatus === "error" ||
    game.channelStatus === "closed";

  // ---------------------------------------------------------------------------
  // Anonymous auth is disabled on the project → cannot create a session at all.
  // Clear, calm message (no answer board to show).
  // ---------------------------------------------------------------------------
  if (session.status === "anonymous_disabled") {
    return (
      <MessageCard
        title="接続できませんでした"
        body="ただいまゲームに参加できません。少し時間をおいてから、もう一度お試しください。"
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Session resolution failed (player-row lookup error, etc.). Offer a retry.
  // ---------------------------------------------------------------------------
  if (session.status === "error") {
    return (
      <MessageCard
        title="問題が発生しました"
        body="ゲーム情報の読み込みに失敗しました。もう一度お試しください。"
        action={{
          label: "再読み込み",
          onClick: () => {
            session.refresh();
            game.refresh();
          },
        }}
      />
    );
  }

  if (notMember) {
    return (
      <MessageCard
        title="参加が必要です"
        body="このゲームで遊ぶには、参加コードから入り直してください。"
        action={{ label: "参加ページへ", onClick: () => router.push("/") }}
      />
    );
  }

  // Hydrate the public {key,label} choices into render-ready Choice[] (color/
  // shape/art come from the static CHOICE_THEME — the single visual adapter).
  const choices = hydrateChoices(game.question?.choices ?? []);
  const revealed = game.revealed;

  // The player's selection is a choice_key: prefer the optimistic pick (instant
  // tap feedback), fall back to the server-recorded my_answer (after refresh).
  // Map it to the numeric index PhoneScreen/JellyButton expect; -1 → null.
  const pickedKey = session.optimisticKey ?? session.myAnswer?.choice_key ?? null;
  const pickedIndex = pickedKey
    ? choices.findIndex((c) => c.key === pickedKey)
    : -1;
  const picked = pickedIndex >= 0 ? pickedIndex : null;

  // correctId is only meaningful once revealed; otherwise -1 (no reveal styling).
  const correctId =
    revealed && game.correctKey
      ? choices.findIndex((c) => c.key === game.correctKey)
      : -1;

  const nickname = session.nickname.trim() || null;
  const initial = session.avatarInitial ?? undefined;
  const avatarColor = session.avatarColor ?? undefined;

  // Live round: needs hydrate so we don't render the answer board on stale defaults.
  const isLiveRound =
    game.hydrated &&
    (game.state === "question_open" ||
      game.state === "locked" ||
      game.state === "reveal") &&
    game.question !== null;

  const ended = game.hydrated && game.state === "ended";
  const showScoreboard =
    game.hydrated &&
    game.state === "scoreboard" &&
    game.leaderboard.length > 0;

  // Lobby while waiting for host — also during session/snapshot soft-reload.
  const waiting =
    (session.loading || session.isMember) &&
    !isLiveRound &&
    !ended &&
    !showScoreboard;

  // This player's own standing, derived from the server-sorted leaderboard by
  // matching their player_id. rank is 1-based; null when not found yet (e.g. the
  // player never scored / leaderboard hasn't arrived). Computed in render from
  // props only — no refs/effects — so it stays Rules-of-React clean.
  const myId = session.player?.id ?? null;
  const myIndex = myId
    ? game.leaderboard.findIndex((e) => e.player_id === myId)
    : -1;
  const rank = myIndex >= 0 ? myIndex + 1 : null;
  const points = myIndex >= 0 ? game.leaderboard[myIndex].total_points : 0;
  const totalPlayers = game.leaderboard.length;
  const standingMaxPoints = ended ? game.maxPoints : game.scoreMaxPoints;

  // Cancel participation: confirm, delete the player row, then go home.
  const handleLeaveConfirm = async () => {
    setLeaving(true);
    await session.leave();
    router.push("/");
  };

  return (
    <>
    <PhoneScreen
      onLeave={() => setShowLeaveConfirm(true)}
      choices={choices}
      picked={picked}
      correctId={correctId}
      revealed={revealed}
      onPick={session.pick}
      roundPhase={game.roundPhase}
      countdownNumber={game.countdownNumber}
      questionMedia={game.question?.media_url ?? null}
      answerChangeAllowed={game.answerChangeAllowed}
      awardedPoints={session.myAnswer?.awarded_points ?? null}
      nickname={nickname}
      finalNickname={nickname}
      initial={initial}
      avatarColor={avatarColor}
      pin={game.pin ?? undefined}
      waiting={waiting}
      connecting={connecting}
      ended={ended}
      scoreboard={showScoreboard}
      rank={rank}
      points={points}
      maxPoints={standingMaxPoints}
      totalPlayers={totalPlayers}
    />

    <AnimatePresence>
      {showLeaveConfirm ? (
        <ConfirmDialog
          title="ゲームから退出しますか？"
          description="スコアは消えます。"
          confirmLabel="退出する"
          cancelLabel="キャンセル"
          pending={leaving}
          confirmTone="rose"
          onCancel={() => setShowLeaveConfirm(false)}
          onConfirm={handleLeaveConfirm}
        />
      ) : null}
    </AnimatePresence>
    </>
  );
}

// Generic calm message card for player-side terminal states (anonymous auth
// disabled, session error). Keeps the cute aesthetic; optional retry action.
function MessageCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={messageCardStyle}
    >
      <span
        aria-hidden
        style={messageCardIconStyle}
      >
        🍵
      </span>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          margin: 0,
          color: "var(--ink)",
        }}
      >
        {title}
      </h2>
      <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 500, fontSize: 14, lineHeight: 1.6 }}>{body}</p>
      {action ? (
        <PuniButton variant="plum" size="sm" wide onClick={action.onClick}>
          {action.label}
        </PuniButton>
      ) : null}
    </div>
  );
}

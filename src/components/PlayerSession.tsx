"use client";

// PlayerSession — the player-side realtime island for /play/[gameId].
//
// Composes the two client hooks (owned by src/lib/realtime/*):
//   - useGameState(gameId): owns the private `game:{id}` channel internally and
//                           exposes server-authoritative phase/question/vote/
//                           reveal, secondsLeft from the absolute deadline, the
//                           game PIN, and correctKey (undefined until reveal).
//   - usePlayerSession(gameId): anonymous session + this game's player row, plus
//                           pick(choiceKey)=submit_answer with optimistic UI.
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

import { hydrateChoices } from "@/lib/quiz";
import Link from "next/link";
import { useGameState } from "@/lib/realtime/useGameState";
import { usePlayerSession } from "@/lib/realtime/usePlayerSession";
import { refreshPlayerBoot, usePlayerBootRefresh } from "@/lib/realtime/playerBoot";
import { usePresence, type PresenceMeta } from "@/lib/realtime/usePresence";
import { PhoneScreen } from "@/components/PhoneScreen";
import { BrandMark } from "@/components/Brand";

export function PlayerSession({ gameId }: { gameId: string }) {
  const game = useGameState(gameId);
  const session = usePlayerSession(gameId);

  // Soft reload loop until player row + snapshot land (same as browser refresh).
  usePlayerBootRefresh(gameId, session, game);

  // Track this player into presence so the host's lobby roster/count updates
  // live. Built from the resolved player row (null until then → no track yet).
  const me: PresenceMeta | null = session.player
    ? {
        player_id: session.player.id,
        nickname: session.player.nickname,
        avatar_color: session.player.avatar_color,
        avatar_initial: session.player.avatar_initial,
        role: "player",
      }
    : null;
  usePresence(game.channel, me, game.presence, game.subscribed);

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
          onClick: () => refreshPlayerBoot(session, game),
        }}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Not a member of this game → invite them to join via the landing page.
  // Only after the session has resolved (loading === false), so we don't flash
  // the prompt during the initial anonymous-session + player-row lookup.
  // (PIN is null for non-members per RLS, so the link falls back to "/".)
  // ---------------------------------------------------------------------------
  if (!session.loading && !session.isMember) {
    return <JoinPrompt pin={game.pin} />;
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

  const nickname = session.nickname || "あなた";
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

  return (
    <PhoneScreen
      choices={choices}
      picked={picked}
      correctId={correctId}
      revealed={revealed}
      onPick={session.pick}
      nickname={nickname}
      initial={initial}
      avatarColor={avatarColor}
      pin={game.pin ?? undefined}
      waiting={waiting}
      connecting={connecting}
      ended={ended}
      scoreboard={showScoreboard}
      rank={rank}
      points={points}
      totalPlayers={totalPlayers}
    />
  );
}

// Small standalone join card shown when the visitor isn't a member of this game
// (deep-linked / lost session). Links back to the landing page with the PIN
// prefilled when we know it, so they can re-enter a nickname and join.
function JoinPrompt({ pin }: { pin: string | null }) {
  const href = pin ? `/?join=${encodeURIComponent(pin)}` : "/";
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px 0" }}>
        <Link href="/" aria-label="puni — ホームへ" style={{ display: "inline-flex", textDecoration: "none" }}>
          <BrandMark />
        </Link>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          textAlign: "center",
          padding: "24px 24px 48px",
          maxWidth: 340,
          margin: "0 auto",
        }}
      >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 22,
          margin: 0,
          color: "var(--ink)",
        }}
      >
        このゲームにまだ参加していません
      </h2>
      <p
        style={{
          margin: 0,
          color: "var(--ink-soft)",
          fontWeight: 500,
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        ニックネームを入れて参加すると、ここでクイズに答えられます。
      </p>
      <a
        href={href}
        style={{
          display: "inline-block",
          textDecoration: "none",
          color: "#fff",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 15,
          padding: "12px 26px",
          borderRadius: 999,
          background:
            "radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%), linear-gradient(158deg, var(--plum), var(--plum-deep))",
          boxShadow: "0 6px 0 var(--plum-deep), 0 12px 20px -8px var(--plum)",
        }}
      >
        参加する
      </a>
      </div>
    </div>
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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        textAlign: "center",
        padding: "48px 24px",
        maxWidth: 340,
        margin: "0 auto",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 64,
          height: 64,
          borderRadius: 22,
          display: "grid",
          placeItems: "center",
          fontSize: 30,
          transform: "rotate(-6deg)",
          background: "color-mix(in srgb, var(--plum) 10%, white)",
          boxShadow: "var(--shadow-soft)",
        }}
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
        <button
          type="button"
          onClick={action.onClick}
          style={{
            cursor: "pointer",
            color: "#fff",
            border: "none",
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15,
            padding: "12px 26px",
            borderRadius: 999,
            background:
              "radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%), linear-gradient(158deg, var(--plum), var(--plum-deep))",
            boxShadow: "0 6px 0 var(--plum-deep), 0 12px 20px -8px var(--plum)",
          }}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

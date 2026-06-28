"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Choice } from "@/lib/quiz";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  JoinCodeDisplay,
  LobbyBody,
  LobbyCard,
  LobbyHeader,
  LobbyHeroGlow,
  LobbyReloadHint,
  LobbyWaitingHeading,
  LOBBY_DOT_COLORS,
  PlayerIdentityPill,
  PlayerLeaveButton,
  WaitingDots,
} from "@/components/LobbyUi";
import { AnswerRain } from "./AnswerRain";
import { PlayerBoard } from "@/components/PlayerBoard";
import { pageShell } from "@/lib/layout";
import type { RoundPhase } from "@/lib/realtime/useGameState";

// Player viewport — Brand + identity pill header; PIN lives in the lobby body only.
function PhoneFrame({
  children,
  nickname,
  avatarInitial,
  avatarColor,
  connecting,
  onLeave,
  tint,
  rain,
}: {
  children: React.ReactNode;
  nickname: string;
  avatarInitial: string;
  avatarColor?: string | null;
  connecting?: boolean;
  onLeave?: () => void;
  /** Optional full-screen wash painted behind the whole frame (header + body),
   *  fading into the page background. Used by the reveal so the tint has no
   *  seams at the top, sides, or bottom. */
  tint?: string;
  /** Optional answer-candy image to rain + pile up across the whole frame,
   *  behind the content (reveal only). */
  rain?: string;
}) {
  return (
    <div
      style={{
        ...pageShell,
        position: "relative",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        // The wash spans the entire frame (incl. behind the header) so there's
        // no horizontal seam at the top; it fades to the page bg lower down.
        backgroundImage: tint,
      }}
    >
      {/* Candy rain fills the WHOLE frame at z-index 0 (behind the content). */}
      {rain ? <AnswerRain src={rain} /> : null}
      {/* Content sits above the rain so the header + answer stay visible. */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <LobbyHeader>
          {onLeave ? <PlayerLeaveButton onClick={onLeave} /> : null}
          <PlayerIdentityPill
            nickname={nickname}
            initial={avatarInitial}
            color={avatarColor}
            connecting={connecting}
          />
        </LobbyHeader>
        {children}
      </div>
    </div>
  );
}

// Calm loading dots — same palette as the host lobby heading.
function LobbyLoadingDots() {
  const reduce = useReducedMotion();
  return <WaitingDots reduce={reduce} />;
}

// "次の問題を待っています" — shimmer text + small bouncing dots, shown inline
// inside the reveal answer card (small 4px dots proportional to the 13px text so
// the "…" reads as a typing indicator, not oversized blobs).
function WaitingLine() {
  const reduce = useReducedMotion();
  return (
    <span style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 6, marginTop: 2 }}>
      <span className="puni-shimmer" style={{ fontSize: 12.5, fontWeight: 700 }}>
        次の問題を待っています
      </span>
      <span aria-hidden style={{ display: "inline-flex", alignItems: "flex-end", gap: 3, paddingBottom: 3 }}>
        {LOBBY_DOT_COLORS.map((c, i) => (
          <motion.span
            key={c}
            animate={reduce ? undefined : { y: [0, -4, 0] }}
            transition={
              reduce
                ? undefined
                : { duration: 1.3, repeat: Infinity, repeatDelay: 0.25, ease: "easeInOut", delay: i * 0.18 }
            }
            style={{ width: 4, height: 4, borderRadius: "50%", background: c }}
          />
        ))}
      </span>
    </span>
  );
}

// Player lead screen: big 3-2-1 during countdown, then "read the question".
function PhoneCountdown({ phase, n }: { phase: "countdown" | "reading"; n: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: 24 }}>
      {phase === "countdown" ? (
        <motion.div
          key={n}
          initial={reduce ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 104, lineHeight: 1, color: "var(--plum)" }}
        >
          {n}
        </motion.div>
      ) : (
        <>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, color: "var(--ink)" }}>問題を読んでね</div>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 500, fontSize: 14 }}>まもなく回答できます</p>
          <WaitingDots reduce={reduce ?? false} />
        </>
      )}
    </div>
  );
}

export function PhoneScreen({
  choices,
  picked,
  correctId,
  revealed,
  onPick,
  nickname = "なお",
  initial,
  avatarColor,
  pin,
  // --- New optional state props (backward compatible) ----------------------
  /** Lobby: game hasn't started — show a calm waiting screen. */
  waiting = false,
  /** Boot/sync stalled — suggest a full page reload. */
  showReloadHint = false,
  /** Channel is reconnecting/errored — show a small "再接続中…" pill. */
  connecting = false,
  /** Game over — show this player's own final result (rank + points). */
  ended = false,
  /** Between rounds — show a brief "現在 X位" standings interstitial. */
  scoreboard = false,
  /** This player's 1-based rank from the leaderboard, or null if unranked. */
  rank = null,
  /** This player's total points. */
  points = 0,
  /** Number of ranked players (for "X人中 Y位" context). */
  totalPlayers = 0,
  roundPhase = null,
  countdownNumber = 0,
  onLeave,
}: {
  choices: Choice[];
  picked: number | null;
  correctId: number;
  revealed: boolean;
  // Receives the stable choice key (matches HostScreen's key-based model),
  // resolved here from JellyButton's numeric id.
  onPick: (key: string) => void;
  nickname?: string;
  initial?: string;
  avatarColor?: string | null;
  pin?: string;
  waiting?: boolean;
  showReloadHint?: boolean;
  connecting?: boolean;
  ended?: boolean;
  scoreboard?: boolean;
  rank?: number | null;
  points?: number;
  totalPlayers?: number;
  /** Live-question sub-phase (countdown → reading → answering), null otherwise. */
  roundPhase?: RoundPhase;
  /** 3-2-1 number during the countdown sub-phase. */
  countdownNumber?: number;
  /** Cancel participation — leave the game and return home. */
  onLeave?: () => void;
}) {
  // correctId is only meaningful once revealed (-1 otherwise) — keep `correct`
  // undefined pre-reveal so the answer can never render early.
  const correct = revealed && correctId >= 0 ? choices[correctId] : undefined;
  const isRight = revealed && picked === correctId;
  // First grapheme of the nickname as the avatar fallback when no explicit
  // initial is supplied. Falls back to the original hardcoded "な".
  const avatarInitial = initial ?? [...nickname][0] ?? "な";
  const headerProps = { nickname, avatarInitial, avatarColor, connecting, onLeave };

  // Translate JellyButton's numeric id back to the choice key for onPick.
  const handlePick = (id: number) => {
    const choice = choices.find((c) => c.id === id);
    if (choice) onPick(choice.key);
  };

  // -------------------------------------------------------------------------
  // WAITING (lobby) — game exists but no question yet (snapshot may still sync).
  // -------------------------------------------------------------------------
  if (waiting) {
    return (
      <PhoneFrame {...headerProps}>
        <WaitingScreen
          nickname={nickname}
          avatarInitial={avatarInitial}
          avatarColor={avatarColor}
          pin={pin}
          showReloadHint={showReloadHint}
        />
      </PhoneFrame>
    );
  }

  // -------------------------------------------------------------------------
  // ENDED — this player's own final result (rank + total points), with a
  // celebratory treatment scaled by placement (crown / 優勝！ for 1st).
  // -------------------------------------------------------------------------
  if (ended) {
    return (
      <PhoneFrame {...headerProps}>
        <PersonalResult
          nickname={nickname}
          avatarInitial={avatarInitial}
          avatarColor={avatarColor}
          rank={rank}
          points={points}
          totalPlayers={totalPlayers}
        />
      </PhoneFrame>
    );
  }

  // -------------------------------------------------------------------------
  // SCOREBOARD — brief between-rounds standings interstitial ("現在 X位").
  // -------------------------------------------------------------------------
  if (scoreboard) {
    return (
      <PhoneFrame {...headerProps}>
        <ScoreboardInterstitial rank={rank} points={points} totalPlayers={totalPlayers} />
      </PhoneFrame>
    );
  }

  // -------------------------------------------------------------------------
  // IN-QUESTION — countdown / reading / answering / reveal, all via the shared
  // PlayerBoard. The reveal tint + candy rain are painted by the frame behind it.
  // -------------------------------------------------------------------------
  return (
    <PhoneFrame
      {...headerProps}
      // On reveal, wash the WHOLE frame (behind the header too) and fade it into
      // the page bg — so there's no seam at the top, sides, or bottom.
      tint={
        revealed && correct
          ? isRight
            ? "linear-gradient(180deg,#eafaf2 0%,#f7f5fb 60%)"
            : "linear-gradient(180deg,#fdeef2 0%,#f7f5fb 60%)"
          : undefined
      }
      // Rain the correct answer's candy across the whole frame on reveal.
      rain={revealed && correct ? correct.icon : undefined}
    >

      <PlayerBoard
        choices={choices}
        picked={picked}
        correctId={correctId}
        revealed={revealed}
        onPick={onPick}
        roundPhase={roundPhase}
        countdownNumber={countdownNumber}
      />
    </PhoneFrame>
  );
}

// Shared centered layout for the waiting / loading states inside the phone.
function CenteredState({
  emoji,
  decoration,
  title,
  subtitle,
  footer,
}: {
  emoji?: string;
  decoration?: React.ReactNode;
  title: string;
  subtitle: string;
  footer?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: "24px 26px 36px",
      }}
    >
      {decoration ?? (emoji ? <span style={{ fontSize: 46 }}>{emoji}</span> : null)}
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, margin: 0, color: "var(--ink)" }}>
        {title}
      </h2>
      <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 500, fontSize: 14, lineHeight: 1.6 }}>{subtitle}</p>
      {footer}
    </div>
  );
}

// -----------------------------------------------------------------------------
// WAITING (lobby) — mirrors host LobbyView: shimmer heading + hero card + PIN.
// -----------------------------------------------------------------------------
function WaitingScreen({
  nickname,
  avatarInitial,
  avatarColor,
  pin,
  showReloadHint = false,
}: {
  nickname: string;
  avatarInitial: string;
  avatarColor?: string | null;
  pin?: string;
  showReloadHint?: boolean;
}) {
  return (
    <LobbyBody>
      <div role="status" aria-live="polite" style={{ display: "contents" }}>
        <LobbyWaitingHeading>ゲーム開始を待っています</LobbyWaitingHeading>
        <LobbyHeroGlow>
          <LobbyCard style={{ gap: 16, padding: "28px 24px", minWidth: "min(100%, 320px)" }}>
            <PlayerAvatar
              nickname={nickname}
              initial={avatarInitial}
              color={avatarColor}
              size="2xl"
            />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 22,
                color: "var(--ink)",
                maxWidth: 240,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {nickname}
            </span>
            {pin ? <JoinCodeDisplay pin={pin} /> : null}
          </LobbyCard>
        </LobbyHeroGlow>
        {showReloadHint ? <LobbyReloadHint /> : null}
      </div>
    </LobbyBody>
  );
}

// A soft, rounded crown for the 1st-place celebration (matches the cute look,
// not a flat emoji). Sized to sit above the rank badge.
function Crown({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.74} viewBox="0 0 64 48" aria-hidden="true">
      <defs>
        <linearGradient id="puniCrownGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe39a" />
          <stop offset="0.5" stopColor="#ffc24d" />
          <stop offset="1" stopColor="#f0a82e" />
        </linearGradient>
      </defs>
      <path
        d="M8 40c0-1 1-2 2-2h44c1 0 2 1 2 2v2c0 1-1 2-2 2H10c-1 0-2-1-2-2z"
        fill="#f0a82e"
      />
      <path
        d="M7 16l11 9 14-18 14 18 11-9-4 24c-.2 1.2-1.2 2-2.4 2H13.4c-1.2 0-2.2-.8-2.4-2z"
        fill="url(#puniCrownGold)"
      />
      <circle cx="7" cy="14" r="4" fill="#ffd866" />
      <circle cx="57" cy="14" r="4" fill="#ffd866" />
      <circle cx="32" cy="6" r="4.5" fill="#ff5c8a" />
      <circle cx="30.5" cy="4.5" r="1.2" fill="#fff" opacity="0.8" />
      <circle cx="24" cy="34" r="2.6" fill="#fff" opacity="0.7" />
      <circle cx="40" cy="34" r="2.6" fill="#fff" opacity="0.7" />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// PERSONAL RESULT (ended) — this player's OWN final standing. 1st place gets the
// full celebration (crown, 優勝！, confetti); lower ranks scale down to "X位！".
// Confetti is client-only, fired once in useEffect (guarded for window).
// -----------------------------------------------------------------------------
function PersonalResult({
  nickname,
  avatarInitial,
  avatarColor,
  rank,
  points,
  totalPlayers,
}: {
  nickname: string;
  avatarInitial: string;
  avatarColor?: string | null;
  rank: number | null;
  points: number;
  totalPlayers: number;
}) {
  const isWinner = rank === 1;
  const isPodium = rank !== null && rank <= 3;
  // Match the host scoreboard medal palette for cross-screen consistency.
  const medal =
    rank === 1 ? "#ffc24d" : rank === 2 ? "#cfd6e6" : rank === 3 ? "#e8a06a" : null;
  const accent = isWinner ? "var(--amber-deep)" : isPodium ? "var(--plum-deep)" : "var(--plum)";

  // Fire confetti once on mount for podium finishers (extra burst for 1st).
  // canvas-confetti is client-only → import + call inside useEffect, guard window.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current || !isPodium) return;
    if (typeof window === "undefined") return;
    firedRef.current = true;
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#7c5cfc", "#ff5c8a", "#ff9c1b", "#12c08a", "#1f9ff0"];
      confetti({
        particleCount: isWinner ? 130 : 70,
        spread: isWinner ? 95 : 70,
        startVelocity: 42,
        origin: { y: 0.45 },
        colors,
        scalar: 0.9,
        disableForReducedMotion: true,
      });
      if (isWinner) {
        // A second, gentle side-puff a beat later for the champion.
        window.setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 60,
            spread: 60,
            origin: { x: 0, y: 0.6 },
            colors,
            scalar: 0.9,
            disableForReducedMotion: true,
          });
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 60,
            origin: { x: 1, y: 0.6 },
            colors,
            scalar: 0.9,
            disableForReducedMotion: true,
          });
        }, 280);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isPodium, isWinner]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: "20px 24px 32px",
      }}
    >
      <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 700, fontSize: 13 }}>
        おつかれさま、{nickname}さん
      </p>

      {/* Rank medallion — crown sits above it for the champion. */}
      <motion.div
        initial={{ scale: 0.4, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 14 }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
      >
        {isWinner ? (
          <motion.span
            aria-hidden
            animate={{ y: [0, -5, 0], rotate: [-5, 5, -5] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            style={{ marginBottom: -6 }}
          >
            <Crown size={62} />
          </motion.span>
        ) : null}
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 116,
            height: 116,
            borderRadius: "50%",
            background: medal
              ? `radial-gradient(115% 90% at 32% 22%, #fff, ${medal} 78%)`
              : "radial-gradient(115% 90% at 32% 22%, #fff, color-mix(in srgb, var(--plum) 16%, white) 78%)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          {rank !== null ? (
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 52,
                lineHeight: 1,
                color: "#fff",
                fontVariantNumeric: "tabular-nums",
                textShadow: "0 2px 6px rgba(40,24,90,0.25)",
              }}
            >
              {rank}
            </span>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 52,
                lineHeight: 1,
                color: "#fff",
                opacity: 0.85,
                textShadow: "0 2px 6px rgba(40,24,90,0.25)",
              }}
            >
              —
            </span>
          )}
        </span>
      </motion.div>

      {/* Headline: 優勝！ for the champion, "X位！" otherwise. */}
      <motion.h2
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 15, delay: 0.08 }}
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: isWinner ? 34 : 28,
          margin: 0,
          color: accent,
        }}
      >
        {isWinner ? "優勝！" : rank !== null ? `${rank}位！` : "おつかれさま！"}
      </motion.h2>

      <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 500, fontSize: 13, lineHeight: 1.6 }}>
        {isWinner
          ? "おめでとう！みんなのトップだよ"
          : isPodium
            ? "すばらしい！表彰台だよ"
            : rank !== null
              ? "ナイスチャレンジ！"
              : "また挑戦してね"}
      </p>

      {/* Points + field-size context. */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
          background: "#fff",
          borderRadius: 999,
          padding: "10px 20px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <b
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 22,
            color: "var(--plum)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {points}
        </b>
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-soft)" }}>pt</span>
        {totalPlayers > 0 && rank !== null ? (
          <span style={{ fontWeight: 600, fontSize: 12, color: "var(--ink-soft)", marginLeft: 4 }}>
            ／ {totalPlayers}人中
          </span>
        ) : null}
      </span>

      {/* Tiny avatar+name footer to anchor "this is YOUR result". */}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 2 }}>
        <PlayerAvatar
          nickname={nickname}
          initial={avatarInitial}
          color={avatarColor}
          size="sm"
        />
        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{nickname}</span>
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SCOREBOARD INTERSTITIAL (between rounds) — a brief "現在 X位" standing so the
// player knows where they sit before the next question. Lighter than the final
// PersonalResult (no confetti / crown); just a calm, encouraging beat.
// -----------------------------------------------------------------------------
function ScoreboardInterstitial({
  rank,
  points,
  totalPlayers,
}: {
  rank: number | null;
  points: number;
  totalPlayers: number;
}) {
  const medal =
    rank === 1 ? "#ffc24d" : rank === 2 ? "#cfd6e6" : rank === 3 ? "#e8a06a" : null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: "24px 26px 36px",
      }}
    >
      <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 700, fontSize: 13 }}>現在の順位</p>
      <motion.span
        key={rank ?? "none"}
        initial={{ scale: 0.5, y: 14, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 14 }}
        style={{
          display: "grid",
          placeItems: "center",
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: medal
            ? `radial-gradient(115% 90% at 32% 22%, #fff, ${medal} 78%)`
            : "radial-gradient(115% 90% at 32% 22%, #fff, color-mix(in srgb, var(--plum) 16%, white) 78%)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 44,
            lineHeight: 1,
            color: "#fff",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 2px 6px rgba(40,24,90,0.25)",
          }}
        >
          {rank ?? "—"}
        </span>
      </motion.span>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 26,
          margin: 0,
          color: "var(--plum-deep)",
        }}
      >
        {rank !== null ? `現在 ${rank}位` : "集計中…"}
      </h2>
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
          background: "#fff",
          borderRadius: 999,
          padding: "8px 18px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <b
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 20,
            color: "var(--plum)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {points}
        </b>
        <span style={{ fontWeight: 700, fontSize: 12, color: "var(--ink-soft)" }}>pt</span>
        {totalPlayers > 0 && rank !== null ? (
          <span style={{ fontWeight: 600, fontSize: 11, color: "var(--ink-soft)", marginLeft: 4 }}>
            ／ {totalPlayers}人中
          </span>
        ) : null}
      </span>
      <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 500, fontSize: 13, lineHeight: 1.6 }}>
        次の問題までもう少し！
      </p>
      <LobbyLoadingDots />
    </div>
  );
}

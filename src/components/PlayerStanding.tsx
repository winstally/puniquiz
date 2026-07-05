"use client";

// PlayerStanding — the SINGLE source of truth for "where this player stands" on
// the phone: the between-rounds scoreboard AND the final result. Built on the
// original between-rounds design (heading → crown → trophy medallion → points →
// "X位 ／N人中") so the two never drift. `final` adds the celebration (confetti +
// "おつかれさま" heading); the mid-round version stays calm and tags a
// "次の問題を待っています" beat. Medal palette matches the host <Leaderboard/>.

import { useEffect, useRef } from "react";
import { m } from "motion/react";
import { TrophyIcon } from "@/components/Leaderboard";
import { ReadingWaitMessage } from "@/components/LobbyUi";
import { POINTS_UNIT } from "@/lib/quiz";
import type { Options as ConfettiOptions } from "canvas-confetti";

// Gold / silver / bronze — identical to the host Leaderboard PLACE theme.
const PLACE: Record<number, { medal: string; deep: string; crown: string }> = {
  1: { medal: "#ffce4d", deep: "#e7a81c", crown: "👑" },
  2: { medal: "#d6dcea", deep: "#a9b2c8", crown: "" },
  3: { medal: "#eaa978", deep: "#cf8553", crown: "" },
};

const standingRootStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 24,
  textAlign: "center",
  padding: "32px 26px 44px",
} as const;

const standingRankStyle = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "center",
  gap: 6,
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 30,
  margin: 0,
  color: "var(--plum-deep)",
} as const;

function standingMedalStyle(medal: string) {
  return {
    display: "grid",
    placeItems: "center",
    width: 100,
    height: 100,
    borderRadius: "50%",
    background: `radial-gradient(115% 90% at 32% 22%, #fff, ${medal} 78%)`,
    boxShadow: "var(--shadow-soft)",
  } as const;
}

async function runStandingConfetti({
  isWinner,
  isCancelled,
}: {
  isWinner: boolean;
  isCancelled: () => boolean;
}): Promise<void> {
  const { default: confetti } = await import("canvas-confetti");
  if (isCancelled()) return;

  const colors = ["#7c5cfc", "#ff5c8a", "#ff9c1b", "#12c08a", "#1f9ff0"];
  const fire = (options: ConfettiOptions) =>
    confetti({ ...options, colors, disableForReducedMotion: true });

  fire({
    particleCount: isWinner ? 130 : 70,
    spread: isWinner ? 95 : 70,
    startVelocity: 42,
    origin: { y: 0.45 },
    scalar: 0.9,
  });
  if (!isWinner) return;

  window.setTimeout(() => {
    if (isCancelled()) return;
    fire({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.6 }, scalar: 0.9 });
    fire({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.6 }, scalar: 0.9 });
  }, 280);
}

export function PlayerStanding({
  nickname,
  rank,
  points,
  totalPlayers,
  final,
}: {
  nickname: string;
  rank: number | null;
  points: number;
  totalPlayers: number;
  /** Final results (confetti + closing copy) vs the between-rounds interstitial. */
  final: boolean;
}) {
  const isWinner = rank === 1;
  const isPodium = rank !== null && rank <= 3;
  const place = rank !== null ? PLACE[rank] : undefined;
  const medal = place?.medal ?? "var(--plum)";
  const crown = place?.crown ?? "";

  // Confetti once on mount — final podium only (the mid-round beat stays calm).
  const firedRef = useRef(false);
  useEffect(() => {
    if (!final || firedRef.current || !isPodium) return;
    if (typeof window === "undefined") return;
    firedRef.current = true;
    let cancelled = false;
    void runStandingConfetti({ isWinner, isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [final, isPodium, isWinner]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={standingRootStyle}
    >
      <p style={{ margin: 0, color: "var(--ink)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, letterSpacing: "0.01em" }}>
        {final ? `おつかれさま、${nickname}さん` : "現在のランキング"}
      </p>

      {crown ? (
        <span aria-hidden style={{ fontSize: 30, lineHeight: 1, marginBottom: -8 }}>{crown}</span>
      ) : null}

      {/* Trophy medallion — gold / silver / bronze (host palette). */}
      <m.span
        key={rank ?? "none"}
        initial={{ scale: 0.5, y: 14, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 14 }}
        style={standingMedalStyle(medal)}
      >
        <span aria-hidden style={{ display: "grid", placeItems: "center", filter: "drop-shadow(0 3px 6px rgba(40,24,90,0.28))" }}>
          <TrophyIcon color="#fff" size={48} />
        </span>
      </m.span>

      <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 700, fontSize: 14 }}>
        <b style={{ color: "var(--plum)", fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>
          {points}
        </b>{" "}
        {POINTS_UNIT}
      </p>

      <h2
        style={standingRankStyle}
      >
        {rank !== null ? (
          <>
            {rank}位
            {totalPlayers > 0 ? (
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>／ {totalPlayers}人中</span>
            ) : null}
          </>
        ) : (
          "集計中…"
        )}
      </h2>

      {/* Between rounds: a calm "waiting for the next question" beat. */}
      {!final ? <ReadingWaitMessage label="次の問題を待っています" /> : null}
    </div>
  );
}

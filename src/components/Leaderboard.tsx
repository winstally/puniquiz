"use client";

// Leaderboard — the SINGLE results view for the host big screen, used for BOTH the
// between-rounds scoreboard (`final={false}`) and the final standings
// (`final={true}`). One source of truth so the mid-game and end-game rankings are
// the exact same layout: a top-3 podium (2nd left / 1st center, raised / 3rd right)
// over a ranking table for everyone else.
//
// Structure mimics a classic leaderboard (podium + table); colours are puni's own
// "大人かわいい" palette (plum / gold-silver-bronze, jelly gloss), not the dark
// reference. Confetti fires once on the FINAL view only. canvas-confetti is
// browser-only — dynamically imported inside an effect, never touched in render.

import { useEffect, useRef } from "react";
import { m, useReducedMotion } from "motion/react";
import type { LeaderboardEntry } from "@/lib/realtime/events";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { POINTS_UNIT } from "@/lib/quiz";
import type { Options as ConfettiOptions } from "canvas-confetti";

// Per-RANK medal theme + size scale. Keyed by competition rank (ties share a
// rank → share a medal + size), so a 2nd-place tie reads as two silvers, and the
// size visibly steps down 1 → 2 → 3 so the order is legible at a glance.
const PLACES = {
  1: { medal: "#ffce4d", deep: "#e7a81c", crown: "👑", avatar: "2xl", card: 232, lead: 30, trophy: 48 },
  2: { medal: "#d6dcea", deep: "#a9b2c8", crown: "", avatar: "xl", card: 198, lead: 25, trophy: 42 },
  3: { medal: "#eaa978", deep: "#cf8553", crown: "", avatar: "xl", card: 172, lead: 22, trophy: 38 },
} as const;
type Place = keyof typeof PLACES;
type PlaceTheme = (typeof PLACES)[Place];

function podiumNameStyle(winner: boolean) {
  return {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: winner ? 19 : 16,
    color: "var(--ink)",
    textAlign: "center",
    maxWidth: 170,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as const;
}

function podiumPointsCardStyle(theme: PlaceTheme) {
  return {
    width: "100%",
    borderRadius: 20,
    background: "linear-gradient(180deg, #ffffff, color-mix(in srgb, var(--plum) 7%, #ffffff))",
    boxShadow: `var(--shadow-card), 0 18px 34px -20px ${theme.deep}`,
    outline: `1.5px solid color-mix(in srgb, ${theme.medal} 50%, var(--hairline))`,
    outlineOffset: -1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "16px 12px 14px",
  } as const;
}

function trophyBadgeStyle(theme: PlaceTheme) {
  return {
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    width: theme.trophy,
    height: theme.trophy,
    borderRadius: 13,
    background: `radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.6), rgba(255,255,255,0) 55%), linear-gradient(160deg, ${theme.medal}, ${theme.deep})`,
    boxShadow: `0 6px 14px -6px ${theme.deep}`,
  } as const;
}

function podiumRankStyle(theme: PlaceTheme) {
  return {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: theme.lead,
    color: "var(--plum-deep)",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.1,
  } as const;
}

const leaderTableHeadStyle = {
  display: "grid",
  gridTemplateColumns: "44px 1fr 64px 96px",
  gap: 8,
  padding: "0 18px 8px",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: 1,
  color: "var(--ink-soft)",
} as const;

const leaderTableRowStyle = {
  display: "grid",
  gridTemplateColumns: "44px 1fr 64px 96px",
  alignItems: "center",
  gap: 8,
  background: "#fff",
  borderRadius: 16,
  padding: "10px 18px",
  boxShadow: "var(--shadow-soft)",
} as const;

const leaderTableRankStyle = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "color-mix(in srgb, var(--plum) 12%, white)",
  color: "var(--plum-deep)",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 14,
  fontVariantNumeric: "tabular-nums",
} as const;

// Competition ranking (1, 2, 2, 4 …): a player's rank is 1 + the number of
// players with STRICTLY more points, so equal scores share a rank. O(n²) but the
// roster is small, and it's robust to the array's exact order.
function computeRanks(entries: LeaderboardEntry[]): number[] {
  return entries.map(
    (e) => 1 + entries.filter((o) => o.total_points > e.total_points).length,
  );
}

// Medal/size bucket for a rank — ranks past 3rd reuse the bronze bucket (only the
// top-3 podium uses this; the table shows the raw rank number).
function placeForRank(rank: number): Place {
  return (rank <= 1 ? 1 : rank === 2 ? 2 : 3) as Place;
}

async function runLeaderboardConfetti({
  isCancelled,
  setFrame,
}: {
  isCancelled: () => boolean;
  setFrame: (frame: number) => void;
}): Promise<void> {
  const { default: confetti } = await import("canvas-confetti");
  if (isCancelled()) return;

  const colors = ["#7c5cfc", "#ff5c8a", "#1f9ff0", "#ff9c1b", "#12c08a"];
  const fire = (options: ConfettiOptions) =>
    confetti({ ...options, colors, disableForReducedMotion: true });

  fire({ particleCount: 170, spread: 120, startVelocity: 50, origin: { x: 0.5, y: 0.42 }, scalar: 1.1 });
  fire({ particleCount: 90, angle: 60, spread: 72, origin: { x: 0, y: 0.7 } });
  fire({ particleCount: 90, angle: 120, spread: 72, origin: { x: 1, y: 0.7 } });

  const end = Date.now() + 4500;
  const frame = () => {
    if (isCancelled()) return;
    fire({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, scalar: 0.9 });
    fire({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, scalar: 0.9 });
    if (Date.now() < end) setFrame(requestAnimationFrame(frame));
  };
  setFrame(requestAnimationFrame(frame));
}

export function TrophyIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M7 4h10v2h3v2a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h2.5a1 1 0 0 1 0 2H8.5a1 1 0 0 1 0-2H11v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V6h3V4Zm-1 4H5a2 2 0 0 0 2 2V8H6Zm12 0v2a2 2 0 0 0 2-2h-2Z" />
    </svg>
  );
}

export function Leaderboard({
  leaderboard,
  final,
}: {
  leaderboard: LeaderboardEntry[];
  final: boolean;
}) {
  const reduce = useReducedMotion();
  const ranks = computeRanks(leaderboard);

  // Podium membership: a player joins the podium only if their whole rank-group
  // fits within the top-3 slots — i.e. at most 3 players score ≥ them. This keeps
  // a tie from being split across the podium/table line: e.g. with one leader and
  // everyone else tied, the seven tied players ALL drop to the table (rather than
  // arbitrarily elevating two of them to silver/bronze). Eligibility is a prefix
  // (a higher scorer is always eligible if a lower one is), so we count the lead.
  let podiumCount = 0;
  for (let i = 0; i < Math.min(3, leaderboard.length); i += 1) {
    const atOrAbove = leaderboard.filter(
      (o) => o.total_points >= leaderboard[i].total_points,
    ).length;
    if (atOrAbove <= 3) podiumCount++;
    else break;
  }
  const rest = leaderboard.slice(podiumCount);
  const restRanks = ranks.slice(podiumCount);

  // Layout: a full podium centres 1st (2nd left / 1st center / 3rd right); a
  // partial podium (ties pushed down) just centres what remains, leader first.
  const slotIdx = podiumCount === 3 ? [1, 0, 2] : Array.from({ length: podiumCount }, (_, i) => i);

  // Confetti on mount — final view only (client-only, reduced-motion aware).
  const fired = useRef(false);
  useEffect(() => {
    if (!final || reduce || typeof window === "undefined") return;
    if (leaderboard.length === 0 || fired.current) return;
    fired.current = true;
    let cancelled = false;
    let raf = 0;
    void runLeaderboardConfetti({
      isCancelled: () => cancelled,
      setFrame: (frame) => {
        raf = frame;
      },
    });
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [final, reduce, leaderboard.length]);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 0 8px", width: "100%" }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(24px,3.2vw,38px)",
          margin: 0,
          textAlign: "center",
          color: "var(--ink)",
          letterSpacing: "0.01em",
        }}
      >
        <span aria-hidden style={{ marginRight: 10 }}>🏆</span>
        {final ? "最終ランキング" : "ランキング"}
      </h2>

      {leaderboard.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--ink-soft)", fontWeight: 500, marginTop: 14 }}>
          まだスコアがありません
        </p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: "clamp(8px,2vw,22px)",
              marginTop: "clamp(18px,4vw,38px)",
            }}
          >
            {slotIdx.map((idx, i) => {
              const entry = leaderboard[idx];
              return (
                <PodiumSlot
                  key={entry.player_id}
                  rank={ranks[idx]}
                  entry={entry}
                  reduce={Boolean(reduce)}
                  delay={ranks[idx] === 1 ? 0.32 : 0.1 + i * 0.06}
                />
              );
            })}
          </div>

          {rest.length > 0 ? <LeaderTable rest={rest} ranks={restRanks} /> : null}
        </>
      )}
    </div>
  );
}

// One podium column — avatar + name above a raised "pedestal" card that carries
// the medal trophy + the player's points.
function PodiumSlot({
  rank,
  entry,
  reduce,
  delay,
}: {
  rank: number;
  entry: LeaderboardEntry;
  reduce: boolean;
  delay: number;
}) {
  const theme = PLACES[placeForRank(rank)];
  const winner = rank === 1;

  return (
    <div style={{ flex: "1 1 0", maxWidth: theme.card, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <m.div
        initial={reduce ? false : { opacity: 0, y: 24, scale: 0.82 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 16, delay: delay + 0.26 }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
      >
        {winner ? (
          <m.span
            aria-hidden
            initial={reduce ? false : { opacity: 0, y: 8, rotate: -12 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 12, delay: delay + 0.46 }}
            style={{ fontSize: 32, lineHeight: 1 }}
          >
            {theme.crown}
          </m.span>
        ) : null}
        <PlayerAvatar
          nickname={entry.nickname}
          initial={entry.avatar_initial}
          color={entry.avatar_color}
          colorSeed={entry.player_id}
          size={theme.avatar}
        />
        <span style={podiumNameStyle(winner)}>
          {entry.nickname}
        </span>
      </m.div>

      {/* Points card — rank badge + trophy + points. Sizes to its content (no
          fixed-height pedestal) so the trophy never gets squished on 2nd / 3rd. */}
      <m.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 20, delay: delay + 0.1 }}
        style={podiumPointsCardStyle(theme)}
      >
        {/* Trophy badge (gold / silver / bronze). */}
        <span
          style={trophyBadgeStyle(theme)}
        >
          <TrophyIcon color="#fff" size={Math.round(theme.trophy * 0.52)} />
        </span>
        {/* Points — secondary, small (same treatment + order as the player screen:
            points first, then the big rank headline). */}
        <span style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 700, fontSize: 13 }}>
          <b style={{ color: "var(--plum)", fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>
            {entry.total_points.toLocaleString()}
          </b>{" "}
          {POINTS_UNIT}
        </span>
        {/* Rank — the headline (matches the player's big "N位"), so the standing
            reads identically and ties show the same number. */}
        <span
          style={podiumRankStyle(theme)}
        >
          {rank}位
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
          正解 {entry.correct_count}問
        </span>
      </m.div>
    </div>
  );
}

// Ranks 4th+ as a clean ranking table (順位 / プレイヤー / 正解 / pt).
function LeaderTable({ rest, ranks }: { rest: LeaderboardEntry[]; ranks: number[] }) {
  return (
    <div style={{ maxWidth: 640, margin: "26px auto 0" }}>
      <div style={leaderTableHeadStyle}>
        <span>順位</span>
        <span>プレイヤー</span>
        <span style={{ textAlign: "right" }}>正解</span>
        <span style={{ textAlign: "right" }}>{POINTS_UNIT}</span>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {rest.map((entry, i) => (
          <li
            key={entry.player_id}
            style={leaderTableRowStyle}
          >
            <span
              style={leaderTableRankStyle}
            >
              {/* Tie-aware overall rank (equal scores share a number). */}
              {ranks[i]}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <PlayerAvatar
                nickname={entry.nickname}
                initial={entry.avatar_initial}
                color={entry.avatar_color}
                colorSeed={entry.player_id}
                size="lg"
              />
              <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.nickname}
              </span>
            </span>
            <span style={{ textAlign: "right", fontWeight: 600, color: "var(--ink-soft)", fontVariantNumeric: "tabular-nums" }}>
              {entry.correct_count}
            </span>
            <span
              style={{
                textAlign: "right",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 17,
                color: "var(--plum)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {entry.total_points.toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

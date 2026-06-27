"use client";

// Podium — the Kahoot-style final-results stage for the top 3, in puni's own
// "大人かわいい" palette (plum/rose/sky, jelly gloss, Zen Maru Gothic), NOT
// Kahoot blue.
//
//   1st  →  center, tallest pedestal (gold)
//   2nd  →  left,  medium pedestal   (silver)
//   3rd  →  right, short pedestal    (bronze)
//
// Each slot shows the player's avatar (initial + their color), nickname and
// total_points. Pedestals rise on mount and the winner pops; canvas-confetti
// fires a couple of volleys. All motion is skipped when the user prefers
// reduced motion. Ranks 4th+ render below as the same compact list the
// intermediate scoreboard uses, so the visual language stays consistent.
//
// canvas-confetti is browser-only: it's dynamically imported inside an effect
// and guarded for `window`, never touched during render (Rules of React).

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { LeaderboardEntry } from "@/lib/realtime/events";
import { PlayerAvatar } from "@/components/PlayerAvatar";

// Per-place visual theme. Heights tuned so 1st clearly towers over 2nd/3rd.
const PLACES = {
  1: {
    height: 184,
    medal: "#ffce4d",
    medalDeep: "#f0a91e",
    label: "1",
  },
  2: {
    height: 130,
    medal: "#d6dcea",
    medalDeep: "#aeb6cc",
    label: "2",
  },
  3: {
    height: 102,
    medal: "#e6a878",
    medalDeep: "#cf8553",
    label: "3",
  },
} as const;

type Place = keyof typeof PLACES;

export function Podium({
  leaderboard,
}: {
  leaderboard: LeaderboardEntry[];
}) {
  const reduce = useReducedMotion();
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  // Render order: 2nd (left), 1st (center), 3rd (right).
  const ordered: Array<{ place: Place; entry: LeaderboardEntry | undefined }> = [
    { place: 2, entry: top3[1] },
    { place: 1, entry: top3[0] },
    { place: 3, entry: top3[2] },
  ];

  // --- Confetti on mount (client-only, reduced-motion aware) -----------------
  const fired = useRef(false);
  useEffect(() => {
    if (reduce) return;
    if (typeof window === "undefined") return;
    if (top3.length === 0) return;
    if (fired.current) return;
    fired.current = true;

    let cancelled = false;
    let raf = 0;

    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#7c5cfc", "#ff5c8a", "#1f9ff0", "#ff9c1b", "#12c08a"];

      // Big opening burst from the center…
      confetti({
        particleCount: 170,
        spread: 120,
        startVelocity: 50,
        origin: { x: 0.5, y: 0.42 },
        colors,
        scalar: 1.1,
        disableForReducedMotion: true,
      });
      // …plus two angled cannons from the bottom corners.
      confetti({ particleCount: 90, angle: 60, spread: 72, origin: { x: 0, y: 0.7 }, colors, disableForReducedMotion: true });
      confetti({ particleCount: 90, angle: 120, spread: 72, origin: { x: 1, y: 0.7 }, colors, disableForReducedMotion: true });

      // Sustained gentle rain so the celebration is actually visible for a while
      // (~4.5s) rather than a single sub-second flash.
      const end = Date.now() + 4500;
      const frame = () => {
        if (cancelled) return;
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors, scalar: 0.9, disableForReducedMotion: true });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors, scalar: 0.9, disableForReducedMotion: true });
        if (Date.now() < end) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduce, top3.length]);

  if (top3.length === 0) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 0" }}>
        <Title />
        <p
          style={{
            textAlign: "center",
            color: "var(--ink-soft)",
            fontWeight: 500,
            marginTop: 12,
          }}
        >
          まだスコアがありません
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 0 8px" }}>
      <Title />

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: "clamp(8px,2vw,20px)",
          marginTop: "clamp(20px,4vw,40px)",
        }}
      >
        {ordered.map(({ place, entry }, i) =>
          entry ? (
            <PodiumColumn
              key={entry.player_id}
              place={place}
              entry={entry}
              reduce={Boolean(reduce)}
              // Stagger by *visual rank* so 1st pops last (most emphasis).
              delay={place === 1 ? 0.34 : 0.12 + i * 0.06}
            />
          ) : (
            // Empty slot placeholder keeps the trio centered with <3 players.
            <div key={`empty-${place}`} style={{ flex: "1 1 0", maxWidth: 200 }} />
          ),
        )}
      </div>

      {rest.length > 0 ? <RestList rest={rest} /> : null}
    </div>
  );
}

function Title() {
  return (
    <h2
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: "clamp(26px,3.4vw,40px)",
        margin: 0,
        textAlign: "center",
        color: "var(--ink)",
        letterSpacing: "0.01em",
      }}
    >
      <span aria-hidden style={{ marginRight: 10 }}>🏆</span>
      最終ランキング
    </h2>
  );
}

function PodiumColumn({
  place,
  entry,
  reduce,
  delay,
}: {
  place: Place;
  entry: LeaderboardEntry;
  reduce: boolean;
  delay: number;
}) {
  const theme = PLACES[place];
  const isWinner = place === 1;

  return (
    <div
      style={{
        flex: "1 1 0",
        maxWidth: isWinner ? 220 : 190,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      {/* Player card (avatar + name + points) pops up above its pedestal. */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 26, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          reduce
            ? { duration: 0 }
            : {
                type: "spring",
                stiffness: 280,
                damping: 16,
                delay: delay + 0.28,
              }
        }
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        {/* Crown for the winner. */}
        {isWinner ? (
          <motion.span
            aria-hidden
            initial={reduce ? false : { opacity: 0, y: 8, rotate: -12 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={
              reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 12, delay: delay + 0.5 }
            }
            style={{ fontSize: 34, lineHeight: 1 }}
          >
            👑
          </motion.span>
        ) : null}

        <PlayerAvatar
          nickname={entry.nickname}
          initial={entry.avatar_initial}
          color={entry.avatar_color}
          colorSeed={entry.player_id}
          size={isWinner ? "2xl" : "xl"}
          ring
        />

        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: isWinner ? 19 : 16,
            color: "var(--ink)",
            textAlign: "center",
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.nickname}
        </span>

        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: isWinner ? 22 : 18,
            color: "var(--plum)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {entry.total_points}
          <span style={{ fontSize: 12, marginLeft: 3, color: "var(--ink-soft)" }}>pt</span>
        </span>
      </motion.div>

      {/* Pedestal — rises from the floor. */}
      <motion.div
        initial={reduce ? false : { height: 0, opacity: 0.4 }}
        animate={{ height: theme.height, opacity: 1 }}
        transition={
          reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18, delay }
        }
        style={{
          width: "100%",
          borderRadius: "22px 22px 0 0",
          background: `radial-gradient(120% 80% at 30% 12%, rgba(255,255,255,0.6), rgba(255,255,255,0) 55%), linear-gradient(180deg, ${theme.medal}, ${theme.medalDeep})`,
          boxShadow: `inset 0 3px 8px rgba(255,255,255,0.55), inset 0 -10px 18px rgba(0,0,0,0.16), 0 18px 30px -18px ${theme.medalDeep}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 16,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.92)",
            color: theme.medalDeep,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 24,
            fontVariantNumeric: "tabular-nums",
            boxShadow: "inset 0 2px 5px rgba(0,0,0,0.1)",
          }}
        >
          {theme.label}
        </span>
      </motion.div>
    </div>
  );
}

// Ranks 4th+ — the same compact card list shape used by the intermediate
// scoreboard, so the two views feel like one family.
function RestList({ rest }: { rest: LeaderboardEntry[] }) {
  return (
    <ol
      style={{
        listStyle: "none",
        margin: "28px auto 0",
        padding: 0,
        maxWidth: 560,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {rest.map((entry, i) => (
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
              background: "color-mix(in srgb, var(--plum) 12%, white)",
              color: "var(--plum-deep)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 15,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {/* +4 because rest starts at the 4th overall rank. */}
            {i + 4}
          </span>
          <PlayerAvatar
            nickname={entry.nickname}
            initial={entry.avatar_initial}
            color={entry.avatar_color}
            colorSeed={entry.player_id}
            size="lg"
          />
          <span style={{ flex: 1, fontWeight: 700, color: "var(--ink)", fontSize: 16 }}>
            {entry.nickname}
          </span>
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
  );
}

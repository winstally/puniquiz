"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Choice } from "@/lib/quiz";
import { ROUND_SECONDS } from "@/lib/quiz";
import { jellyStyle } from "@/lib/jelly";
import { Card } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Dessert, QuizHero } from "./Dessert";

// A roster avatar (driven by Presence). Falls back to the original demo crowd
// when no roster is supplied so the standalone visual stays identical.
export type RosterAvatar = { initial: string; bg: string };

const DEFAULT_PLAYERS: RosterAvatar[] = [
  { initial: "Y", bg: "#ff8fb4" },
  { initial: "K", bg: "#6cc2ff" },
  { initial: "M", bg: "#ffc24d" },
  { initial: "R", bg: "#9b8bff" },
];

const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { x: Math.cos(a) * 150, y: Math.sin(a) * 110, c: ["#ff8fb4", "#ffc24d", "#6cc2ff", "#12c08a"][i % 4] };
});

// Shared "who's here" stack: up to 4 avatars + the authoritative count. Used on
// the in-game board AND in the host header so presence reads identically in every
// phase (one source — usePresence, where count === roster.length).
export function PlayerRow({ roster, count }: { roster: RosterAvatar[]; count: number }) {
  // Show at most 4 avatars in the stack; the numeric count is authoritative.
  const shown = roster.slice(0, 4);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700, color: "var(--ink-soft)", fontSize: 14, flex: "0 0 auto" }}>
      <span style={{ display: "flex" }}>
        {shown.map((p, i) => (
          <PlayerAvatar
            key={i}
            initial={p.initial}
            color={p.bg}
            size="md"
            stacked
            className={i ? "-ml-2" : undefined}
          />
        ))}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>人
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        color: "var(--plum-deep)",
        fontSize: 15,
        background: "color-mix(in srgb, var(--plum) 12%, white)",
        padding: "5px 14px",
        borderRadius: 999,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </span>
  );
}

// The reveal "正解は…" jelly card. Extracted so the correct-answer values are
// only ever computed inside the revealed branch (correctId is meaningless
// otherwise). Visuals/animation are unchanged from the inlined original.
function RevealCard({
  correct,
  correctVotes,
  correctPct,
}: {
  correct: Choice;
  correctVotes: number;
  correctPct: number;
}) {
  return (
    <motion.div
      initial={{ scale: 0.35, y: 24, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 17, delay: 0.08 }}
      style={{
        position: "relative",
        marginTop: 2,
        ...jellyStyle({ color: correct.color, deep: correct.deep, radius: 28, lift: 10 }),
        padding: "24px clamp(24px,6vw,48px) 22px",
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      {SPARKS.map((s, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={{ x: s.x, y: s.y, scale: [0, 1.3, 0.9], opacity: [0, 1, 0] }}
          transition={{ duration: 0.9, delay: 0.25, ease: "easeOut" }}
          style={{ position: "absolute", top: "50%", left: "50%", width: 14, height: 14, borderRadius: 4, background: s.c, zIndex: 0 }}
        />
      ))}

      <span style={{ position: "relative", zIndex: 2, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: 3, opacity: 0.95 }}>
        正解は…
      </span>

      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 13, delay: 0.18 }}
        style={{ position: "relative", zIndex: 2, display: "grid", placeItems: "center", width: 132, height: 132, borderRadius: "50%", background: "#fff", boxShadow: "inset 0 3px 8px rgba(0,0,0,0.08)" }}
      >
        <Dessert type={correct.art} size={96} />
      </motion.span>

      <span style={{ position: "relative", zIndex: 2, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, color: "#fff" }}>
        {correct.label}
      </span>
      <span style={{ position: "relative", zIndex: 2, fontWeight: 700, fontSize: 14, color: "#fff", opacity: 0.92 }}>
        {correctVotes}人が正解（{correctPct}%）
      </span>
    </motion.div>
  );
}

export function HostScreen({
  choices,
  eyebrow,
  question,
  votes,
  seconds,
  totalSeconds = ROUND_SECONDS,
  correctId,
  revealed,
  roster = DEFAULT_PLAYERS,
  count = 24,
}: {
  choices: Choice[];
  eyebrow: string;
  question: string;
  votes: number[];
  seconds: number;
  /** Authoritative round length for the ring ratio (defaults to ROUND_SECONDS). */
  totalSeconds?: number;
  /** Index of the correct choice — only meaningful while `revealed`; -1 = none. */
  correctId: number;
  revealed: boolean;
  /** Lobby/connected roster avatars (from Presence). */
  roster?: RosterAvatar[];
  /** Authoritative connected player count (from Presence). */
  count?: number;
}) {
  const total = votes.reduce((a, b) => a + b, 0);

  const R = 30;
  const C = 2 * Math.PI * R;
  // Guard against a zero/negative totalSeconds so the ring ratio stays finite.
  const ratio = totalSeconds > 0 ? seconds / totalSeconds : 0;
  const low = seconds <= 5;

  const headingStyle = {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    color: "var(--ink)",
    lineHeight: 1.26,
    letterSpacing: "0.005em",
    margin: 0,
    textWrap: "balance" as const,
  };

  return (
    <Card
      aria-label="ホスト画面"
      style={{
        gap: 0,
        borderRadius: 30,
        border: "1px solid var(--hairline)",
        padding: "28px clamp(20px,3vw,36px) 30px",
        boxShadow: "0 2px 4px rgba(43,26,94,0.04), 0 26px 60px -34px rgba(43,26,94,0.4)",
        overflow: "hidden",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {!revealed ? (
          <motion.div
            key="board"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            style={{ display: "flex", flexDirection: "column", gap: 18 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <Eyebrow>{eyebrow}</Eyebrow>
              <PlayerRow roster={roster} count={count} />
            </div>

            <h2 style={{ ...headingStyle, fontSize: "clamp(24px,3.1vw,34px)" }}>{question}</h2>

            <QuizHero />

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", width: 60, height: 60, flex: "0 0 auto" }}>
                <svg width="60" height="60" viewBox="0 0 64 64" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="32" cy="32" r={R} fill="none" stroke="var(--track)" strokeWidth="6" />
                  <motion.circle
                    cx="32"
                    cy="32"
                    r={R}
                    fill="none"
                    stroke={low ? "var(--rose)" : "var(--plum)"}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    animate={{ strokeDashoffset: (1 - ratio) * C }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 22,
                    fontVariantNumeric: "tabular-nums",
                    color: low ? "var(--rose)" : "var(--ink)",
                  }}
                >
                  {seconds}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 15, color: "var(--ink-soft)" }}>
                <span style={{ color: "var(--ink)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>残り{seconds}秒</span>
                <span style={{ margin: "0 8px", color: "var(--line)" }}>·</span>
                <b style={{ color: "var(--ink)", fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}>{total}人</b>が回答
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 16 }}>
              {choices.map((c, i) => {
                const v = votes[c.id];
                return (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26, delay: 0.05 * i }}
                    whileHover={{ y: -5 }}
                    style={{
                      position: "relative",
                      background: `linear-gradient(180deg, #ffffff, color-mix(in srgb, ${c.color} 5%, #ffffff))`,
                      borderRadius: 22,
                      padding: "20px 16px 16px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                      boxShadow: `var(--shadow-card), 0 16px 30px -20px ${c.color}`,
                      outline: `1px solid color-mix(in srgb, ${c.color} 16%, var(--hairline))`,
                      outlineOffset: -1,
                    }}
                  >
                    <span style={{ position: "absolute", top: 16, right: 16, fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", fontVariantNumeric: "tabular-nums" }}>
                      {v}票
                    </span>

                    <div style={{ position: "relative", display: "grid", placeItems: "center", marginTop: 4 }}>
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          width: 104,
                          height: 104,
                          borderRadius: "50%",
                          background: `radial-gradient(circle, color-mix(in srgb, ${c.color} 22%, white) 28%, rgba(255,255,255,0) 72%)`,
                        }}
                      />
                      <span style={{ position: "relative", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.12))" }}>
                        <Dessert type={c.art} size={66} />
                      </span>
                    </div>

                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 20, color: "var(--ink)", textAlign: "center", lineHeight: 1.15 }}>
                      {c.label}
                    </span>

                    <div style={{ width: "100%", height: 7, borderRadius: 999, background: "rgba(20,12,45,0.07)", overflow: "hidden", marginTop: 2 }}>
                      <motion.div
                        animate={{ width: `${total ? (v / total) * 100 : 0}%` }}
                        transition={{ type: "spring", stiffness: 150, damping: 20 }}
                        style={{ height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${c.color}, ${c.deep})`, boxShadow: `0 0 8px -2px ${c.color}` }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", flexWrap: "wrap" }}>
              <Eyebrow>正解発表</Eyebrow>
              <PlayerRow roster={roster} count={count} />
            </div>

            <h2 style={{ ...headingStyle, fontSize: "clamp(22px,2.8vw,30px)", textAlign: "center", width: "100%" }}>{question}</h2>

            <QuizHero maxWidth={360} />

            {(() => {
              // correctId is only meaningful in the revealed branch; guard the
              // index so a -1 / out-of-range never reaches the visual.
              const correct = correctId >= 0 ? choices[correctId] : undefined;
              if (!correct) return null;
              const correctVotes = votes[correctId] ?? 0;
              const correctPct = total ? Math.round((correctVotes / total) * 100) : 0;
              return <RevealCard correct={correct} correctVotes={correctVotes} correctPct={correctPct} />;
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

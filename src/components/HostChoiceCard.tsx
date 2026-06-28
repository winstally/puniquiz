"use client";

// HostChoiceCard — ONE answer tile for the host big screen. The single source of
// truth for how a host-side choice looks (image-main jelly art, label caption,
// vote bar, reveal check). Used by both the live <HostScreen/> and the landing
// <DemoBoard/>, so the marketing demo can never drift from the real product.

import { motion } from "motion/react";
import type { Choice } from "@/lib/quiz";
import {
  AnswerChoiceBadge,
  AnswerChoiceImage,
  AnswerChoiceVoteBar,
  answerChoiceCardStyle,
} from "@/components/AnswerChoiceCard";

export function HostChoiceCard({
  choice,
  votes,
  total,
  index = 0,
  shown = true,
  dim = false,
  pop = false,
  fillBar = true,
  hover = true,
}: {
  choice: Choice;
  votes: number;
  total: number;
  /** Stagger index for the entrance. */
  index?: number;
  /** Gate the entrance/vote-fill (DemoBoard waits for scroll-in; host = always). */
  shown?: boolean;
  /** Revealed-and-wrong → dim. */
  dim?: boolean;
  /** Revealed-and-correct → lift + check badge. */
  pop?: boolean;
  /** Whether the vote bar should fill to its share. */
  fillBar?: boolean;
  /** Hover lift (off for static contexts). */
  hover?: boolean;
}) {
  const c = choice;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={shown ? { opacity: dim ? 0.5 : 1, y: 0, scale: pop ? 1.035 : 1 } : { opacity: 0, y: 16 }}
      transition={{ type: "spring", stiffness: 320, damping: 26, delay: shown && !pop ? 0.12 + 0.06 * index : 0 }}
      whileHover={hover && !dim ? { y: -5 } : undefined}
      style={{
        ...answerChoiceCardStyle(c, { selected: pop, dimmed: dim }),
      }}
    >
      <span style={{ position: "absolute", top: 14, right: 16, fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", fontVariantNumeric: "tabular-nums" }}>
        {votes}票
      </span>

      <AnswerChoiceBadge choice={c} />

      {/* Main slot = the uploaded image when present. No image → the answer TEXT
          is the main content (no giant shape in the image slot). */}
      <AnswerChoiceImage choice={c} />

      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: c.image_url ? 16 : 21,
          color: "var(--ink)",
          textAlign: "center",
          lineHeight: 1.25,
          marginTop: c.image_url ? 0 : 6,
        }}
      >
        {c.label}
      </span>

      <AnswerChoiceVoteBar
        choice={c}
        percent={fillBar && total > 0 ? (votes / total) * 100 : 0}
      />

      {pop ? (
        <motion.span
          initial={{ scale: 0, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 18 }}
          aria-hidden
          style={{
            position: "absolute",
            top: -9,
            right: -9,
            width: 26,
            height: 26,
            borderRadius: 999,
            background: "#fff",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 5px 12px -4px rgba(40,28,64,0.35)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.2 4.2L19 7" />
          </svg>
        </motion.span>
      ) : null}
    </motion.div>
  );
}

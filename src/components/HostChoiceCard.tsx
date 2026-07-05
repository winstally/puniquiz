"use client";

// HostChoiceCard — ONE answer tile for the host big screen. The single source of
// truth for how a host-side choice looks (image-main jelly art, label caption,
// vote bar, reveal check). Used by both the live <HostScreen/> and the landing
// <DemoBoard/>, so the marketing demo can never drift from the real product.

import { m } from "motion/react";
import type { Choice } from "@/lib/quiz";
import {
  AnswerChoiceCard,
  AnswerChoicePhoto,
  AnswerChoiceText,
  AnswerChoiceVoteBar,
} from "@/components/AnswerChoiceCard";

const correctBadgeStyle: React.CSSProperties = {
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
};

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
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={shown ? { opacity: dim ? 0.5 : 1, y: 0, scale: pop ? 1.035 : 1 } : { opacity: 0, y: 16 }}
      transition={{ type: "spring", stiffness: 320, damping: 26, delay: shown && !pop ? 0.12 + 0.06 * index : 0 }}
      whileHover={hover && !dim ? { y: -5 } : undefined}
    >
      <AnswerChoiceCard
        choice={c}
        selected={pop}
        dimmed={dim}
        hideBadge
        // Frameless on the host big screen: no tinted card background / border /
        // shadow — just the photo, gummy, label and vote bar. (The player phone
        // keeps the card frame since the tile IS the tap target.)
        style={{ background: "transparent", boxShadow: "none", outline: "none" }}
        media={<AnswerChoicePhoto choice={c} />}
        // Tally lives with the bar (below the photo) — the gummy already breaks
        // the photo's top corner, so a second overlay on the image reads cluttered.
        footer={
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <span
              style={{
                alignSelf: "flex-end",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--ink-soft)",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              <span style={{ fontSize: 17, color: "var(--ink)" }}>{votes}</span>票
            </span>
            <AnswerChoiceVoteBar
              choice={c}
              percent={fillBar && total > 0 ? (votes / total) * 100 : 0}
            />
          </div>
        }
        overlay={
          <>
            {pop ? (
              <m.span
                initial={{ opacity: 0, scale: 0.95, rotate: -12 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 18 }}
                aria-hidden
                style={correctBadgeStyle}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5l4.2 4.2L19 7" />
                </svg>
              </m.span>
            ) : null}
          </>
        }
      >
        <AnswerChoiceText choice={c} />
      </AnswerChoiceCard>
    </m.div>
  );
}

"use client";

import { m } from "motion/react";
import { REVEAL_PROMPT_TEXT } from "@/lib/reveal-timing";

type RevealSuspenseVariant = "host" | "player";

const variantStyle = {
  host: {
    minHeight: "55vh",
    padding: 40,
    fontSize: "clamp(44px, 9vw, 96px)",
    pulse: 1.06,
    duration: 0.55,
  },
  player: {
    minHeight: "100%",
    padding: 24,
    fontSize: "clamp(34px, 12vw, 56px)",
    pulse: 1.07,
    duration: 0.6,
  },
} as const;

export function RevealSuspense({
  variant = "host",
  promptDelayMs = 0,
}: {
  variant?: RevealSuspenseVariant;
  promptDelayMs?: number;
}) {
  const style = variantStyle[variant];
  const delay = promptDelayMs / 1000;

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: style.minHeight,
        padding: style.padding,
      }}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: [1, style.pulse, 1] }}
        transition={{
          opacity: { duration: 0.12, delay },
          scale: { duration: style.duration, repeat: Infinity, ease: "easeInOut", delay },
        }}
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: style.fontSize,
          color: "var(--plum-deep)",
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {REVEAL_PROMPT_TEXT}
      </m.div>
    </m.div>
  );
}

"use client";

import { m } from "motion/react";
import { REVEAL_PROMPT_TEXT } from "@/lib/reveal-timing";
import { CountdownRing } from "@/components/CountdownRing";

type RevealSuspenseVariant = "host" | "player";

const variantStyle = {
  host: {
    minHeight: "42vh",
    padding: "24px 16px",
    fontSize: "clamp(44px, 9vw, 96px)",
    ringSize: 88,
    pulse: 1.06,
    duration: 0.55,
  },
  player: {
    minHeight: "100%",
    padding: 24,
    fontSize: "clamp(34px, 12vw, 56px)",
    ringSize: 64,
    pulse: 1.07,
    duration: 0.6,
  },
} as const;

export function RevealSuspense({
  variant = "host",
  promptDelayMs = 0,
  countdownNumber = 0,
  countdownTotal = 4,
}: {
  variant?: RevealSuspenseVariant;
  promptDelayMs?: number;
  countdownNumber?: number;
  countdownTotal?: number;
}) {
  const style = variantStyle[variant];
  const delay = promptDelayMs / 1000;
  const showCountdown = countdownNumber > 0;

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
        boxSizing: "border-box",
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
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: variant === "host" ? 24 : 14,
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        {showCountdown ? (
          <CountdownRing
            seconds={countdownNumber}
            total={countdownTotal}
            size={style.ringSize}
            warnAt={1}
          />
        ) : null}
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: style.fontSize,
            color: "var(--plum-deep)",
            textAlign: "center",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {REVEAL_PROMPT_TEXT}
        </span>
      </m.div>
    </m.div>
  );
}

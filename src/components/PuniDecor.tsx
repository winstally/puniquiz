"use client";

// PuniDecor — the floating candy world. The same glossy answer buttons players
// tap in-game (/answers/*.png) drift gently around the hero and the CTA band, so
// the whole page feels like the inside of the app. Decorative + aria-hidden;
// motion is disabled under prefers-reduced-motion.

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

// The in-game answer-button art: 0 red△ / 1 blue◆ / 2 amber● / 3 green■.
const ANSWERS = ["/answers/0.png", "/answers/1.png", "/answers/2.png", "/answers/3.png"];

type Floater = {
  src: string;
  size: number;
  delay: number;
  rotate: number;
  style: React.CSSProperties;
};

function FloatingPiece({ src, size, delay, rotate, style }: Floater) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      style={{ position: "absolute", pointerEvents: "none", ...style }}
      // `initial` must NOT depend on `reduce`: useReducedMotion() is false on the
      // server but true on a reduced-motion client's first render, so gating the
      // initial transform here caused a hydration mismatch. Keep the base transform
      // deterministic; only the looping animation is gated below.
      initial={{ y: 0, rotate: rotate - 4 }}
      animate={reduce ? undefined : { y: [0, -14, 0], rotate: [rotate - 4, rotate + 4, rotate - 4] }}
      transition={reduce ? undefined : { duration: 6 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ display: "block", filter: "drop-shadow(0 12px 16px rgba(60,40,110,0.22))" }}
      />
    </motion.div>
  );
}

// Preset scatters. `variant` picks where pieces sit relative to the parent box.
const PRESETS: Record<string, Floater[]> = {
  hero: [
    { src: ANSWERS[1], size: 66, delay: 0.2, rotate: -8, style: { top: "5%", right: "31%" } },
    { src: ANSWERS[0], size: 58, delay: 0.9, rotate: 10, style: { top: "47%", left: "2%" } },
    { src: ANSWERS[2], size: 46, delay: 0.6, rotate: -6, style: { bottom: "20%", right: "33%" } },
    { src: ANSWERS[3], size: 52, delay: 1.4, rotate: 14, style: { bottom: "10%", right: "5%" } },
    { src: ANSWERS[1], size: 30, delay: 1.8, rotate: 0, style: { top: "12%", right: "2%" } },
  ],
  cta: [
    { src: ANSWERS[0], size: 60, delay: 0.3, rotate: -12, style: { top: "14%", left: "5%" } },
    { src: ANSWERS[2], size: 44, delay: 1.1, rotate: 8, style: { bottom: "14%", left: "10%" } },
    { src: ANSWERS[1], size: 52, delay: 0.7, rotate: 12, style: { top: "18%", right: "7%" } },
    { src: ANSWERS[3], size: 46, delay: 1.5, rotate: -10, style: { bottom: "12%", right: "5%" } },
  ],
  // Narrow screens: scattered within the top + bottom bands only (never over the
  // copy or the join card). Varied size / angle / offset so it reads organic, not
  // one-per-corner symmetric.
  heroNarrow: [
    { src: ANSWERS[1], size: 42, delay: 0.2, rotate: -12, style: { top: "5%", left: "1.5%" } },
    { src: ANSWERS[0], size: 30, delay: 0.9, rotate: 14, style: { top: "7%", right: "3%" } },
    { src: ANSWERS[2], size: 26, delay: 1.6, rotate: 8, style: { top: "25%", left: "1%" } },
    { src: ANSWERS[3], size: 28, delay: 0.5, rotate: -7, style: { top: "21%", right: "1%" } },
    { src: ANSWERS[1], size: 46, delay: 1.3, rotate: 11, style: { bottom: "9%", right: "6%" } },
    { src: ANSWERS[2], size: 32, delay: 0.7, rotate: -9, style: { bottom: "13%", left: "2%" } },
    { src: ANSWERS[0], size: 22, delay: 2.0, rotate: 5, style: { bottom: "8%", left: "22%" } },
  ],
};

export function FloatingShapes({ variant }: { variant: "hero" | "cta" }) {
  if (variant === "hero") {
    return (
      <div aria-hidden className="floaters floaters-hero" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div className="floaters-wide">
          {PRESETS.hero.map((p, i) => (
            <FloatingPiece key={`w${i}`} {...p} />
          ))}
        </div>
        <div className="floaters-narrow">
          {PRESETS.heroNarrow.map((p, i) => (
            <FloatingPiece key={`n${i}`} {...p} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={`floaters floaters-${variant}`}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
    >
      {PRESETS[variant].map((p, i) => (
        <FloatingPiece key={i} {...p} />
      ))}
    </div>
  );
}

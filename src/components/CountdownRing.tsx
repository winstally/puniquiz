"use client";

// CountdownRing — the SSOT "円のカウンター": a ring that drains as the seconds
// tick down, with the number in its centre. Used for the reading lead (count
// down to when answering opens) on both the host big screen and the phone, so
// the two never drift. The ring geometry matches the host answer-timer ring.

import { m } from "motion/react";

function ringNumberStyle(size: number, low: boolean) {
  return {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: Math.round(size * 0.4),
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    color: low ? "var(--rose)" : "var(--ink)",
  } as const;
}

export function CountdownRing({
  seconds,
  total,
  size = 64,
  warnAt = 1,
}: {
  /** Whole seconds remaining (shown in the centre). */
  seconds: number;
  /** Window length the ring represents, for the drain ratio. */
  total: number;
  /** Outer diameter in px. */
  size?: number;
  /** Warm-tint threshold: ring + number go rose at `seconds <= warnAt`. The 3-2-1
   *  read lead stays calm until the final second (1); the answer window warns
   *  earlier (5). Keeping it here — one component — is what keeps the host and
   *  phone rings from drifting. */
  warnAt?: number;
}) {
  const R = 27; // < 32 - strokeWidth/2 so the ring + round caps fit the 64 viewBox (no clipping)
  const C = 2 * Math.PI * R;
  const ratio = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const low = seconds <= warnAt;

  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
        <svg width={size} height={size} viewBox="0 0 64 64" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="32" cy="32" r={R} fill="none" stroke="var(--track)" strokeWidth="6" />
          <m.circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={low ? "var(--rose)" : "var(--plum)"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={false}
            animate={{ strokeDashoffset: (1 - ratio) * C }}
            transition={{ duration: 1, ease: "linear" }}
          />
        </svg>
        <div style={ringNumberStyle(size, low)}>
          {seconds}
        </div>
    </div>
  );
}

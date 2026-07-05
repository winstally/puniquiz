"use client";

import { useEffect, useState } from "react";

export type DemoPhase = "await" | "countdown" | "answering" | "reveal";

// The demo round as a per-second timeline. One tick = one second; the loop walks
// this list and wraps. It mirrors the real host-driven flow: the question is
// parked (await) to be read, then a 3-2-1 ring before answers open, the answer
// window, and the reveal. `secs` is the number shown inside the ring during the
// countdown/answer phases — so the ring actually counts down for real. No
// setState in the effect body (only in the interval callback) to stay clear of
// the cascading-render lint.
const TIMELINE: ReadonlyArray<{ phase: DemoPhase; secs: number }> = [
  // The parked question (await) shows no answer area, so it's the sparsest frame —
  // keep it to a short "read the question" beat before the 3-2-1, so the fixed
  // footprint isn't sat on a mostly-empty board for long.
  { phase: "await", secs: 0 },
  { phase: "await", secs: 0 },
  { phase: "countdown", secs: 3 },
  { phase: "countdown", secs: 2 },
  { phase: "countdown", secs: 1 },
  { phase: "answering", secs: 5 },
  { phase: "answering", secs: 4 },
  { phase: "answering", secs: 3 },
  { phase: "answering", secs: 2 },
  { phase: "answering", secs: 1 },
  { phase: "reveal", secs: 0 },
  { phase: "reveal", secs: 0 },
];

export function useDemoLoop(active: boolean): { phase: DemoPhase; secs: number } {
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const id = setInterval(() => {
      if (!cancelled) setT((prev) => (prev + 1) % TIMELINE.length);
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  const step = TIMELINE[t] ?? TIMELINE[0];
  return { phase: step.phase, secs: step.secs };
}

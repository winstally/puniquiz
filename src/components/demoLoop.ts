"use client";

import { useEffect, useState } from "react";

export type DemoPhase = "countdown" | "reading" | "answering" | "reveal";

// The demo round as a per-second timeline. One tick = one second; the loop walks
// this list and wraps. `secs` is the number shown big during the 3-2-1 countdown
// and inside the timer ring during the read/answer phases — so the ring actually
// counts down for real. No setState in the effect body (only in the interval
// callback) to stay clear of the cascading-render lint.
const TIMELINE: ReadonlyArray<{ phase: DemoPhase; secs: number }> = [
  { phase: "countdown", secs: 3 },
  { phase: "countdown", secs: 2 },
  { phase: "countdown", secs: 1 },
  { phase: "reading", secs: 3 },
  { phase: "reading", secs: 2 },
  { phase: "reading", secs: 1 },
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

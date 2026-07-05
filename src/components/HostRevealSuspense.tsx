"use client";

import { RevealSuspense } from "@/components/RevealSuspense";
import { DRUMROLL_MS, drumrollStartDelayMs } from "@/lib/reveal-timing";

// HostRevealSuspense — big-screen "溜め" shown while the drumroll builds, holding
// the answer back so the reveal lands on the drumroll's climax.
export function HostRevealSuspense() {
  return (
    <RevealSuspense
      variant="host"
      promptDelayMs={drumrollStartDelayMs(DRUMROLL_MS)}
    />
  );
}

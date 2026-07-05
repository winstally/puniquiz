"use client";

import { RevealSuspense } from "@/components/RevealSuspense";

// HostRevealSuspense — big-screen "溜め" shown while the drumroll builds, holding
// the answer back so the reveal lands on the drumroll's climax.
export function HostRevealSuspense({
  countdownNumber,
  countdownTotal,
}: {
  countdownNumber?: number;
  countdownTotal?: number;
}) {
  return (
    <RevealSuspense
      variant="host"
      countdownNumber={countdownNumber}
      countdownTotal={countdownTotal}
    />
  );
}

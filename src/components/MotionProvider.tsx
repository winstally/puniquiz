"use client";

import { domMax, LazyMotion } from "motion/react";
import type { ReactNode } from "react";

// The whole app renders animations through the tree-shakeable `m` component
// (motion/react). `m` carries NO animation features on its own — a LazyMotion
// ancestor must load them, or every m.* silently renders as a static element.
// We load `domMax` (not `domAnimation`) because the host screen uses `layout`
// animations, which live in the max feature bundle.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domMax}>{children}</LazyMotion>;
}

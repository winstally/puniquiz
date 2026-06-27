import type { CSSProperties } from "react";

// layout — the SINGLE source of truth for page layout width + gutters.
//
// Every top-level page <main> spreads `pageShell`, so the frame is identical
// app-wide: full width up to PAGE_MAX_WIDTH, fluid side padding (responsive),
// centered. Change it here, it changes everywhere — no page hardcodes its own
// width anymore (that's what was "割れていた" before).

export const PAGE_MAX_WIDTH = 1160;

export const pageShell: CSSProperties = {
  width: "100%",
  maxWidth: PAGE_MAX_WIDTH,
  margin: "0 auto",
  padding: "30px clamp(14px, 4vw, 40px) 64px",
};

// Phone-first reading column — the player viewport and centered join/prompt
// content. One value so "phone width" is defined exactly once (was 460 vs 480).
export const CONTENT_NARROW = 460;

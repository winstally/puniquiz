import type { CSSProperties } from "react";

/** White pill chrome used in host header, player header, and presence rows. */
export function softPillStyle(padding = "7px 16px 7px 13px"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "#fff",
    borderRadius: 999,
    padding,
    boxShadow: "var(--shadow-soft)",
  };
}

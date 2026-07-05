import type { CSSProperties } from "react";
import { ghostPill, plumPill } from "@/lib/puni-button";

export { ghostPill, plumPill };

export const cardStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 28,
  padding: "26px clamp(20px, 4vw, 34px)",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export const eyebrowStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 1,
  color: "var(--ink-soft)",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--line)",
  borderRadius: 16,
  padding: "13px 16px",
  fontSize: 16,
  fontFamily: "var(--font-body)",
  color: "var(--ink)",
  background: "#fbfafe",
  outline: "none",
};

export const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

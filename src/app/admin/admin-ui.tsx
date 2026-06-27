// Shared presentational pieces + style tokens for the /admin area. Mirrors the
// "大人かわいい" look of the landing page (plum gradient pills, soft cards, the
// rounded "p" mark) so admin feels like the same product. RSC-friendly: these
// are plain components/objects with no client state.

import Link from "next/link";
import { BrandMark } from "@/components/Brand";
import { pageShell } from "@/lib/layout";

export const plumPill: React.CSSProperties = {
  color: "#fff",
  border: "none",
  height: "auto",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 14,
  padding: "11px 20px",
  borderRadius: 999,
  background:
    "radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%), linear-gradient(158deg, var(--plum), var(--plum-deep))",
  boxShadow: "0 6px 0 var(--plum-deep), 0 12px 20px -8px var(--plum)",
};

export const ghostPill: React.CSSProperties = {
  color: "var(--ink)",
  border: "1.5px solid var(--line)",
  height: "auto",
  background: "#fff",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 14,
  padding: "10px 18px",
  borderRadius: 999,
  boxShadow: "var(--shadow-card)",
};

export const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 28,
  padding: "26px clamp(20px, 4vw, 34px)",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 2,
  color: "var(--ink-soft)",
  textTransform: "uppercase",
};

export const inputStyle: React.CSSProperties = {
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

export const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
};

export function AdminBrand() {
  return (
    <Link
      href="/admin"
      aria-label="puni studio"
      style={{
        display: "inline-flex",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <BrandMark />
    </Link>
  );
}

// Shell wrapper used by every admin page: centered column, generous padding.
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={pageShell}>{children}</main>
  );
}

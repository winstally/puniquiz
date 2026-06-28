import type { CSSProperties } from "react";

/** Shared icon sizing for leading icons on puni pill buttons. */
export const PUNI_ICON = { sm: 15, md: 16, lg: 17 } as const;
export const PUNI_ICON_STROKE = 2.4;
export const PUNI_BUTTON_GAP = 8;

export type PuniButtonSize = "sm" | "md" | "lg";
export type PuniButtonTone = "default" | "plum" | "rose";

const SIZE: Record<
  PuniButtonSize,
  { fontSize: number; padding: string; icon: (typeof PUNI_ICON)[keyof typeof PUNI_ICON] }
> = {
  sm: { fontSize: 13, padding: "9px 16px", icon: PUNI_ICON.sm },
  md: { fontSize: 15, padding: "13px 24px", icon: PUNI_ICON.md },
  lg: { fontSize: 16, padding: "14px 32px", icon: PUNI_ICON.lg },
};

const CHROME: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: PUNI_BUTTON_GAP,
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  borderRadius: 999,
  height: "auto",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** SSOT pill styles — plum / ghost / soft (+ tone). */
export function puniButtonStyle(opts: {
  variant: "plum" | "ghost" | "soft";
  size?: PuniButtonSize;
  tone?: PuniButtonTone;
  wide?: boolean;
}): CSSProperties {
  const size = opts.size ?? "md";
  const tone = opts.tone ?? "default";
  const { fontSize, padding, icon } = SIZE[size];
  void icon;

  const base: CSSProperties = {
    ...CHROME,
    fontSize,
    lineHeight: 1,
    boxSizing: "border-box",
    padding: opts.wide
      ? size === "lg"
        ? "15px 24px"
        : size === "sm"
          ? "12px 26px"
          : "11px 20px"
      : padding,
  };

  if (opts.variant === "plum") {
    return {
      ...base,
      color: "#fff",
      border: "none",
      background:
        "radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%), linear-gradient(158deg, var(--plum), var(--plum-deep))",
      boxShadow: "0 6px 0 var(--plum-deep), 0 12px 20px -8px var(--plum)",
    };
  }

  if (opts.variant === "ghost") {
    return {
      ...base,
      color: tone === "plum" ? "var(--plum-deep)" : "var(--ink)",
      border:
        tone === "plum"
          ? "1.5px solid color-mix(in oklch, var(--plum) 40%, var(--line))"
          : "1.5px solid var(--line)",
      background: "#fff",
      boxShadow: "var(--shadow-card)",
    };
  }

  // soft — white secondary (host bar, dialogs, leave)
  const rose = tone === "rose";
  const plum = tone === "plum";
  return {
    ...base,
    minHeight: size === "sm" ? 44 : undefined,
    color: rose ? "var(--rose-deep)" : plum ? "var(--plum-deep)" : "var(--ink-soft)",
    border: rose
      ? "1.5px solid color-mix(in srgb, var(--rose) 38%, var(--line))"
      : "1px solid var(--hairline)",
    background: "#fff",
    boxShadow: "var(--shadow-soft)",
  };
}

/** @deprecated Import puniButtonStyle — kept for admin imports. */
export const plumPill = puniButtonStyle({ variant: "plum", size: "md", wide: true });
/** @deprecated Import puniButtonStyle — kept for admin imports. */
export const ghostPill = puniButtonStyle({ variant: "ghost", size: "md", wide: true });

export function puniIconSize(size: PuniButtonSize = "md"): number {
  return SIZE[size].icon;
}

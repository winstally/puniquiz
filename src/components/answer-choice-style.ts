import type { CSSProperties } from "react";
import type { Choice } from "@/lib/quiz";

export type ChoiceVisual = Pick<Choice, "color" | "deep" | "icon" | "label" | "image_url">;

export function answerChoiceCardStyle(
  choice: ChoiceVisual,
  {
    selected = false,
    dimmed = false,
    compact = false,
  }: {
    selected?: boolean;
    dimmed?: boolean;
    compact?: boolean;
  } = {},
): CSSProperties {
  return {
    position: "relative",
    background: `linear-gradient(180deg, #ffffff, color-mix(in srgb, ${choice.color} 6%, #ffffff))`,
    borderRadius: compact ? 18 : 22,
    padding: compact ? "18px 14px 14px" : "20px 16px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: compact ? 9 : 11,
    boxShadow: selected
      ? `var(--shadow-card), 0 18px 34px -18px ${choice.color}`
      : `var(--shadow-card), 0 16px 30px -20px ${choice.color}`,
    outline: `1.5px solid color-mix(in srgb, ${choice.color} ${selected ? 70 : 16}%, var(--hairline))`,
    outlineOffset: -1,
    opacity: dimmed ? 0.5 : 1,
    transition: "opacity .15s, box-shadow .15s, outline-color .15s",
  };
}

export const answerChoiceInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid transparent",
  borderRadius: 12,
  outline: "2px solid transparent",
  outlineOffset: 2,
  background: "rgba(255,255,255,0.62)",
  color: "var(--ink)",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 16,
  lineHeight: 1.25,
  textAlign: "center",
  padding: "8px 10px",
};

export function answerChoiceCheckButtonStyle(choice: ChoiceVisual, checked: boolean): CSSProperties {
  // A real checkbox (rounded square), not a radio-looking circle — it reads as
  // "tick the correct answer". Filled in the choice's accent when checked.
  return {
    width: 30,
    height: 30,
    borderRadius: 9,
    border: `2px solid ${checked ? choice.color : "color-mix(in srgb, var(--ink-soft) 45%, var(--line))"}`,
    background: checked ? choice.color : "#fff",
    color: checked ? "#fff" : "var(--ink-soft)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 16,
    lineHeight: 1,
    boxShadow: checked ? `0 8px 16px -10px ${choice.deep}` : "none",
    transition: "background .12s, border-color .12s",
  };
}

export function answerChoiceImagePickerStyle(size: number): CSSProperties {
  return {
    marginTop: 12,
    width: size,
    height: size,
    borderRadius: 16,
    border: "1.5px dashed var(--line)",
    background: "rgba(255,255,255,0.64)",
    color: "var(--ink-soft)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 700,
  };
}

export const answerChoiceRemoveButtonStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 999,
  background: "#fff",
  color: "var(--ink-soft)",
  cursor: "pointer",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 12,
  lineHeight: 1,
  padding: "7px 10px",
};

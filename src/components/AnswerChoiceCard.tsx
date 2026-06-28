"use client";

import type { CSSProperties } from "react";
import type { Choice } from "@/lib/quiz";

type ChoiceVisual = Pick<Choice, "color" | "deep" | "icon" | "label" | "image_url">;

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

export function AnswerChoiceBadge({
  choice,
  size = 30,
}: {
  choice: ChoiceVisual;
  size?: number;
}) {
  return (
    <span
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.14))",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={choice.icon}
        alt=""
        aria-hidden
        style={{ width: size, height: size, objectFit: "contain", display: "block" }}
      />
    </span>
  );
}

export function AnswerChoiceImage({
  choice,
  size = 130,
}: {
  choice: ChoiceVisual;
  size?: number;
}) {
  if (!choice.image_url) return null;
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center", marginTop: 8 }}>
      <span
        aria-hidden
        style={{
          position: "absolute",
          width: size + 2,
          height: size + 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, color-mix(in srgb, ${choice.color} 22%, white) 28%, rgba(255,255,255,0) 72%)`,
        }}
      />
      <span style={{ position: "relative", filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.14))" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={choice.image_url}
          alt=""
          style={{
            width: size,
            height: size,
            objectFit: "cover",
            borderRadius: Math.max(12, Math.round(size * 0.14)),
            display: "block",
          }}
        />
      </span>
    </div>
  );
}

export function AnswerChoiceVoteBar({
  choice,
  percent,
}: {
  choice: ChoiceVisual;
  percent: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: 7,
        borderRadius: 999,
        background: "rgba(20,12,45,0.07)",
        overflow: "hidden",
        marginTop: 2,
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          height: "100%",
          borderRadius: 999,
          background: `linear-gradient(90deg, ${choice.color}, ${choice.deep})`,
          boxShadow: `0 0 8px -2px ${choice.color}`,
        }}
      />
    </div>
  );
}


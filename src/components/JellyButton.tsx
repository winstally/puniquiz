"use client";

import Image from "next/image";
import type { Choice } from "@/lib/quiz";
import { AnswerChoicePhoto } from "@/components/AnswerChoiceCard";

function jellyButtonStyle(locked: boolean, dimmed: boolean) {
  return {
    position: "relative",
    border: "none",
    background: "transparent",
    cursor: locked ? "default" : "pointer",
    padding: "8px 6px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    opacity: dimmed ? 0.4 : 1,
    transition: "opacity .15s",
  } as const;
}

function pickedBadgeStyle(deep: string) {
  return {
    position: "absolute",
    top: 2,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: deep,
    display: "grid",
    placeItems: "center",
    boxShadow: "0 3px 8px -2px rgba(0,0,0,0.3)",
  } as const;
}

// JellyButton — the player's tap target, stripped down: just the glossy candy
// (choice.icon, the /answers shape that maps to the host big screen) + the choice
// title. No custom 3D button frame, no card background, no dessert photo, and no
// answer-submitted animation. Picked → full, with a static check; others dim.
export function JellyButton({
  choice,
  picked,
  dimmed,
  locked = false,
  onPick,
}: {
  choice: Choice;
  /** Kept for caller compatibility (stagger is no longer animated). */
  index?: number;
  picked: boolean;
  dimmed: boolean;
  /** Once answered the choice is final (Kahoot-style) — lock all taps. */
  locked?: boolean;
  onPick: (id: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={choice.label}
      aria-pressed={picked}
      aria-disabled={locked}
      onClick={locked ? undefined : () => onPick(choice.id)}
      style={jellyButtonStyle(locked, dimmed)}
    >
      {choice.image_url ? (
        // Photo choice: the actual answer image (corner gummy keeps the
        // colour/shape mapping to the host big screen).
        <AnswerChoicePhoto choice={choice} size={132} />
      ) : (
        <Image
          src={choice.icon}
          alt=""
          aria-hidden
          width={176}
          height={176}
          unoptimized
          style={{
            width: "100%",
            maxWidth: 176,
            aspectRatio: "1 / 1",
            objectFit: "contain",
            display: "block",
            filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.18))",
          }}
        />
      )}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 16,
          lineHeight: 1.25,
          textAlign: "center",
          color: "var(--ink)",
        }}
      >
        {choice.label}
      </span>
      {picked ? (
        <span
          aria-hidden
          style={pickedBadgeStyle(choice.deep)}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5l2.8 2.8L12.5 5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}

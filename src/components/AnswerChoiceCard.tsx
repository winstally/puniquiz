"use client";

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { ImagePlus } from "lucide-react";
import { glowHaloStyle } from "@/components/glow-halo";
import {
  answerChoiceCardStyle,
  answerChoiceCheckButtonStyle,
  answerChoiceImagePickerStyle,
  answerChoiceInputStyle,
  answerChoiceRemoveButtonStyle,
  type ChoiceVisual,
} from "@/components/answer-choice-style";

function AnswerChoiceBadge({
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
      <Image
        src={choice.icon}
        alt=""
        aria-hidden
        width={size}
        height={size}
        unoptimized
        style={{ width: size, height: size, objectFit: "contain", display: "block" }}
      />
    </span>
  );
}

export function AnswerChoiceCard({
  choice,
  selected = false,
  dimmed = false,
  compact = false,
  minHeight,
  topRight,
  media,
  footer,
  overlay,
  children,
  style,
  badgeSize,
  hideBadge = false,
}: {
  choice: ChoiceVisual;
  selected?: boolean;
  dimmed?: boolean;
  compact?: boolean;
  minHeight?: number;
  topRight?: ReactNode;
  /** Undefined uses the default answer image. Null intentionally leaves it empty. */
  media?: ReactNode;
  footer?: ReactNode;
  overlay?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  /** Override the corner gummy badge size (host big screen wants it larger). */
  badgeSize?: number;
  /** Suppress the card-corner gummy (e.g. when it's overlaid on the photo instead). */
  hideBadge?: boolean;
}) {
  return (
    <div
      style={{
        ...answerChoiceCardStyle(choice, { selected, dimmed, compact }),
        minHeight,
        ...style,
      }}
    >
      {hideBadge ? null : <AnswerChoiceBadge choice={choice} size={badgeSize} />}
      {topRight ? (
        <div
          style={{
            position: "absolute",
            top: compact ? 12 : 14,
            right: compact ? 14 : 16,
            zIndex: 2,
          }}
        >
          {topRight}
        </div>
      ) : null}
      {media === undefined ? <AnswerChoiceImage choice={choice} /> : media}
      {children}
      {footer}
      {overlay}
    </div>
  );
}

export function AnswerChoiceText({
  choice,
  value,
  onChange,
  placeholder,
  maxLength,
  invalid,
  describedBy,
}: {
  choice: ChoiceVisual;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
  describedBy?: string;
}) {
  if (onChange) {
    return (
      <input
        className="puni-tile-input"
        aria-label={placeholder ?? "回答テキスト"}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          ...answerChoiceInputStyle,
          ...(invalid
            ? {
                outline: "2px solid var(--rose)",
                outlineOffset: 2,
              }
            : null),
        }}
      />
    );
  }

  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: choice.image_url ? 16 : 21,
        color: "var(--ink)",
        textAlign: "center",
        lineHeight: 1.25,
        marginTop: choice.image_url ? 0 : 6,
      }}
    >
      {choice.label}
    </span>
  );
}

export function AnswerChoiceCheckButton({
  choice,
  checked,
  onClick,
  ariaLabel,
}: {
  choice: ChoiceVisual;
  checked: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      aria-label={ariaLabel}
      style={answerChoiceCheckButtonStyle(choice, checked)}
    >
      {checked ? "✓" : ""}
    </button>
  );
}

// Answer thumbnails are square — the CHOICE_IMAGE_ASPECT (1:1) side of the image
// aspect SSOT (see src/lib/quiz.ts). Kept square via a single `size` (width===height),
// cover-filled like any thumbnail.
function AnswerChoiceImage({
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
        style={glowHaloStyle(choice.color)}
      />
      <span style={{ position: "relative", filter: "drop-shadow(0 5px 8px rgba(0,0,0,0.14))" }}>
        <Image
          src={choice.image_url}
          alt=""
          width={size}
          height={size}
          unoptimized
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

// AnswerChoicePhoto — the dessert photo (AnswerChoiceImage) with the glossy gummy
// (choice.icon) overlaid on its top-left corner. The SINGLE source of truth for the
// "photo + corner gummy" look, shared by the host answering tiles and the reveal —
// the badge scales with the photo so both screens read identically.
export function AnswerChoicePhoto({
  choice,
  size = 130,
}: {
  choice: ChoiceVisual;
  size?: number;
}) {
  const gummy = Math.round(size * 0.42);
  if (!choice.image_url) {
    return (
      <div style={{ position: "relative", display: "inline-grid", placeItems: "center", width: size, height: size, marginTop: 8 }}>
        <span
          aria-hidden
          style={glowHaloStyle(choice.color)}
        />
        <Image
          src={choice.icon}
          alt=""
          aria-hidden
          width={gummy}
          height={gummy}
          unoptimized
          style={{
            position: "relative",
            width: gummy,
            height: gummy,
            objectFit: "contain",
            filter: "drop-shadow(0 4px 8px rgba(40,28,64,0.32))",
          }}
        />
      </div>
    );
  }
  return (
    <div style={{ position: "relative", display: "inline-grid", placeItems: "center" }}>
      <AnswerChoiceImage choice={choice} size={size} />
      <Image
        src={choice.icon}
        alt=""
        aria-hidden
        width={gummy}
        height={gummy}
        unoptimized
        style={{
          position: "absolute",
          left: -Math.round(size * 0.06),
          top: -Math.round(size * 0.04),
          width: gummy,
          height: gummy,
          objectFit: "contain",
          filter: "drop-shadow(0 4px 8px rgba(40,28,64,0.32))",
        }}
      />
    </div>
  );
}

export function AnswerChoiceImagePicker({
  choice,
  size = 104,
  onSelect,
}: {
  choice: ChoiceVisual;
  size?: number;
  onSelect: (file: File) => void;
}) {
  if (choice.image_url) return <AnswerChoiceImage choice={choice} size={size} />;

  return (
    <label
      aria-label="答えに画像を追加"
      title="画像を追加"
      style={answerChoiceImagePickerStyle(size)}
    >
      <ImagePlus size={18} />
      画像
      <input
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function AnswerChoiceRemoveImageButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
      <button
        type="button"
        onClick={onClick}
        aria-label="画像を削除"
        style={answerChoiceRemoveButtonStyle}
      >
        画像を削除
      </button>
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

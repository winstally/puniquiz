"use client";

import { avatarColor, avatarGlossStyle, avatarInitial, type AvatarGlossSize } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: 24, font: 11 },
  md: { box: 27, font: 11 },
  lg: { box: 32, font: 15 },
  xl: { box: 62, font: 24 },
  "2xl": { box: 78, font: 30 },
} as const;

export type PlayerAvatarSize = AvatarGlossSize;

export type PlayerAvatarProps = {
  nickname?: string;
  initial?: string | null;
  color?: string | null;
  /** Stable fallback when `color` is null (player_id, nickname, …). */
  colorSeed?: string;
  size?: PlayerAvatarSize;
  /** White ring for overlapping avatar stacks (PlayerRow). */
  stacked?: boolean;
  /** White ring on coloured backgrounds (podium). Off on white cards. */
  ring?: boolean;
  className?: string;
};

function playerAvatarStyle({
  bg,
  size,
  box,
  font,
  display,
  stacked,
  ring,
}: {
  bg: string;
  size: PlayerAvatarSize;
  box: number;
  font: number;
  display: boolean;
  stacked?: boolean;
  ring?: boolean;
}) {
  return {
    ...avatarGlossStyle(bg, size, { stacked, ring }),
    width: box,
    height: box,
    minWidth: box,
    minHeight: box,
    flex: "0 0 auto",
    flexShrink: 0,
    fontSize: font,
    fontWeight: 700,
    fontFamily: display ? "var(--font-display)" : undefined,
  } as const;
}

/** Single visual SSOT for player initials avatars (glossy jelly circle). */
export function PlayerAvatar({
  nickname = "",
  initial,
  color,
  colorSeed,
  size = "md",
  stacked,
  ring,
  className,
}: PlayerAvatarProps) {
  const letter = avatarInitial(nickname, initial);
  const bg = avatarColor(color, colorSeed ?? nickname);
  const { box, font } = SIZES[size];
  const display = size === "lg" || size === "xl" || size === "2xl";

  return (
    <span
      aria-hidden
      className={cn(className)}
      style={playerAvatarStyle({ bg, size, box, font, display, stacked, ring })}
    >
      {letter}
    </span>
  );
}

import type { CSSProperties } from "react";

/** Palette cycled when `players.avatar_color` is null (deterministic by seed). */
export const AVATAR_TINTS = [
  "#ff8fb4",
  "#6cc2ff",
  "#ffc24d",
  "#9b8bff",
  "#12c08a",
] as const;

export type AvatarGlossSize = "sm" | "md" | "lg" | "xl" | "2xl";

export function avatarInitial(
  nickname: string,
  explicit?: string | null,
): string {
  return (explicit ?? nickname.slice(0, 1) ?? "?").toUpperCase();
}

/** Resolve display color: DB value first, else stable tint from seed (player_id / nickname). */
export function avatarColor(
  explicit?: string | null,
  seed?: string,
): string {
  if (explicit) return explicit;
  if (!seed) return AVATAR_TINTS[0];
  let h = 0;
  for (const c of seed) h = (h + c.charCodeAt(0)) | 0;
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}

/** Pick a tint for a new player row (join). */
export function pickAvatarColor(seed: string): string {
  return avatarColor(null, seed);
}

/** Glossy jelly circle — the single visual treatment for all player avatars. */
export function avatarGlossStyle(
  color: string,
  size: AvatarGlossSize,
  opts?: { stacked?: boolean; ring?: boolean },
): CSSProperties {
  const large = size === "xl" || size === "2xl";
  const gloss = `radial-gradient(120% 90% at 30% 20%, rgba(255,255,255,0.55), rgba(255,255,255,0) 55%), ${color}`;

  return {
    borderRadius: "50%",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    boxSizing: "border-box",
    lineHeight: 1,
    background: gloss,
    boxShadow: large
      ? `0 10px 22px -10px ${color}, inset 0 3px 6px rgba(255,255,255,0.45), inset 0 -8px 12px rgba(0,0,0,0.16)`
      : `inset 0 2px 4px rgba(255,255,255,0.42), inset 0 -4px 8px rgba(0,0,0,0.12), 0 4px 10px -6px color-mix(in srgb, ${color} 45%, transparent)`,
    // White ring only on stacks / coloured backgrounds — on white cards it reads as a seam.
    border: opts?.stacked ? "2px solid #fff" : opts?.ring ? "3px solid #fff" : undefined,
  };
}

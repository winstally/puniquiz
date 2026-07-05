import type { CSSProperties } from "react";

export const GLOW_HALO_BLUR = 22;
export const GLOW_HALO_OPACITY = 0.85;
export const GLOW_HALO_INSET = "-18%";
export const FEATURE_CANDY_FRAME_SIZE = 150;
export const FEATURE_CANDY_SIZE = 100;
export const PLAYER_REVEAL_CANDY_SIZE = FEATURE_CANDY_SIZE;

export function glowHaloStyle(
  color: string,
  options: {
    inset?: CSSProperties["inset"];
    borderRadius?: CSSProperties["borderRadius"];
    opacity?: CSSProperties["opacity"];
    zIndex?: CSSProperties["zIndex"];
  } = {},
): CSSProperties {
  return {
    position: "absolute",
    inset: options.inset ?? GLOW_HALO_INSET,
    borderRadius: options.borderRadius ?? 999,
    zIndex: options.zIndex ?? 0,
    background: `radial-gradient(circle at 50% 46%, color-mix(in oklch, ${color} 30%, #fff), transparent 70%)`,
    filter: `blur(${GLOW_HALO_BLUR}px)`,
    opacity: options.opacity ?? GLOW_HALO_OPACITY,
    pointerEvents: "none",
  };
}

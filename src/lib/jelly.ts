import type { CSSProperties } from "react";

export function jellyStyle({
  color,
  deep,
  radius = 26,
  lift = 10,
}: {
  color: string;
  deep: string;
  radius?: number;
  lift?: number;
}): CSSProperties {
  return {
    position: "relative",
    borderRadius: radius,
    color: "#fff",
    background: `radial-gradient(110% 75% at 30% 16%, rgba(255,255,255,0.45), rgba(255,255,255,0) 42%), linear-gradient(158deg, ${color} 0%, ${deep} 100%)`,
    boxShadow: `inset 0 4px 9px rgba(255,255,255,0.4), inset 0 -12px 20px rgba(0,0,0,0.14), 0 ${lift}px 0 ${deep}, 0 ${lift + 12}px 22px -16px ${deep}`,
    overflow: "hidden",
  };
}

// ChoiceShape — the in-game answer marks (▲◆●■), shared by the landing demo and
// feature cards so the page speaks the quiz's own visual language.

export type Shape = "triangle" | "diamond" | "circle" | "square";

export function ChoiceShape({
  shape,
  color,
  size = 24,
}: {
  shape: Shape;
  color: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: color,
    stroke: color,
    strokeWidth: 2.4,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (shape === "circle") return <svg {...common}><circle cx="12" cy="12" r="8.5" /></svg>;
  if (shape === "square") return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="4" /></svg>;
  if (shape === "diamond") return <svg {...common}><path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" /></svg>;
  return <svg {...common}><path d="M12 4.5 20 19 4 19Z" /></svg>;
}

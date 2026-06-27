export type ShapeType = "triangle" | "square" | "diamond" | "circle";

export function Shape({
  type,
  size = 24,
  fill = "#fff",
}: {
  type: ShapeType;
  size?: number;
  fill?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {type === "triangle" && <polygon points="16,4 29,28 3,28" fill={fill} />}
      {type === "square" && <rect x="6" y="6" width="20" height="20" rx="4" fill={fill} />}
      {type === "diamond" && <polygon points="16,3 29,16 16,29 3,16" fill={fill} />}
      {type === "circle" && <circle cx="16" cy="16" r="12" fill={fill} />}
    </svg>
  );
}

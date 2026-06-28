import type { ShapeType } from "@/components/Shape";

// Choice now carries a stable string `key` (matches DB questions.choices[].key).
// `id` (numeric index) is kept so the existing visual components — which index
// votes[c.id] / call onPick(c.id) — work unchanged.
export type Choice = {
  id: number;
  key: string;
  label: string;
  color: string;
  deep: string;
  shape: ShapeType;
  icon: string;
  image_url?: string | null;
};

export type Question = {
  eyebrow: string;
  text: string;
  choices: Choice[];
  correctId: number;
};

// Default round length. HostScreen still imports this as a fallback for the
// countdown-ring ratio until it is fully prop-driven by time_limit_seconds.
export const ROUND_SECONDS = 20;

// CHOICE_THEME: the single static palette/shape table, indexed by choice
// position. This is the one adapter point that keeps every visual component
// (JellyButton / HostScreen / PlayerBoard) unchanged: the DB only stores
// {key,label}; color/deep/shape/icon are re-hydrated here by index.
export const CHOICE_THEME: ReadonlyArray<{
  color: string;
  deep: string;
  shape: ShapeType;
  /** Glossy jelly answer icon (color + white shape), by choice position. */
  icon: string;
}> = [
  { color: "var(--rose)", deep: "var(--rose-deep)", shape: "triangle", icon: "/answers/0.png" },
  { color: "var(--sky)", deep: "var(--sky-deep)", shape: "diamond", icon: "/answers/1.png" },
  { color: "var(--amber)", deep: "var(--amber-deep)", shape: "circle", icon: "/answers/2.png" },
  { color: "var(--sage)", deep: "var(--sage-deep)", shape: "square", icon: "/answers/3.png" },
];

// Merge DB {key,label} with the fixed 4-choice theme by index → renderable Choice[].
export function hydrateChoices(
  dbChoices: ReadonlyArray<{ key: string; label: string; image_url?: string | null }>,
): Choice[] {
  return dbChoices.map((c, i) => {
    const theme = CHOICE_THEME[i % CHOICE_THEME.length];
    return {
      id: i,
      key: c.key,
      label: c.label,
      color: theme.color,
      deep: theme.deep,
      shape: theme.shape,
      icon: theme.icon,
      image_url: c.image_url ?? null,
    };
  });
}

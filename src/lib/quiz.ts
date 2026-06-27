import type { DessertType } from "@/components/Dessert";
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
  art: DessertType;
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

// CHOICE_THEME: the single static palette/shape/art table, indexed by choice
// position. This is the one adapter point that keeps every visual component
// (Dessert/JellyButton/HostScreen reveal) unchanged: the DB only stores
// {key,label}; color/deep/shape/art are re-hydrated here by index.
export const CHOICE_THEME: ReadonlyArray<{
  color: string;
  deep: string;
  shape: ShapeType;
  art: DessertType;
}> = [
  { color: "var(--rose)", deep: "var(--rose-deep)", shape: "triangle", art: "tiramisu" },
  { color: "var(--sky)", deep: "var(--sky-deep)", shape: "diamond", art: "pudding" },
  { color: "var(--amber)", deep: "var(--amber-deep)", shape: "square", art: "shortcake" },
  { color: "var(--sage)", deep: "var(--sage-deep)", shape: "circle", art: "pancake" },
];

// Merge DB {key,label} with CHOICE_THEME by index → renderable Choice[].
// Theme wraps around if there are more choices than theme entries.
export function hydrateChoices(
  dbChoices: ReadonlyArray<{ key: string; label: string }>,
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
      art: theme.art,
    };
  });
}

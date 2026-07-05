// Shared (non-"use server") types + parsing/validation helpers for the /admin
// quiz authoring forms. Kept out of any "use server" module so it can export
// plain (sync) functions and types — Next 16 requires "use server" modules to
// export only async functions.
//
// The wire format is intentionally simple: forms post a JSON blob in a single
// hidden field so we can carry the full nested quiz (title/description + an
// ordered list of questions, each with 4 {key,label} choices and a
// correct_key). Server Actions parse + validate this blob, never trusting the
// client shape.

export const CHOICE_KEYS = ["a", "b", "c", "d"] as const;
export type ChoiceKey = (typeof CHOICE_KEYS)[number];

export const FIXED_CHOICE_COUNT = 4;
export const MIN_TIME_LIMIT = 5;
export const MAX_TIME_LIMIT = 120;
export const MIN_POINTS = 100;
export const MAX_POINTS = 5000;

// Default new-question scaffold values, surfaced to the client form too.
export const DEFAULT_TIME_LIMIT = 20;
export const DEFAULT_POINTS_BASE = 1000;

// Map a 0-based choice index to its canonical key (a/b/c/d).
export function keyForIndex(index: number): ChoiceKey {
  return CHOICE_KEYS[index] ?? CHOICE_KEYS[CHOICE_KEYS.length - 1];
}

// ---------------------------------------------------------------------------
// Client-side draft shapes (what the editor island holds in state and serializes)
// ---------------------------------------------------------------------------
export type DraftChoice = {
  key: string;
  label: string;
  image_url?: string | null;
  image_file?: File | null;
  image_preview_url?: string | null;
};

export type DraftQuestion = {
  text: string;
  /** Answer-window length in seconds, or null = 手動 (host closes by hand). */
  time_limit_seconds: number | null;
  points_base: number;
  choices: DraftChoice[];
  correct_key: string;
  media_url?: string | null;
  media_file?: File | null;
  media_preview_url?: string | null;
};

export type DraftQuiz = {
  title: string;
  description: string;
  is_published: boolean;
  questions: DraftQuestion[];
};

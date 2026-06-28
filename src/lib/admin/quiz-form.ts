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
export const MAX_QUESTIONS = 50;

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 280;
export const QUESTION_TEXT_MAX = 200;
export const CHOICE_LABEL_MAX = 80;

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
  time_limit_seconds: number;
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

// ---------------------------------------------------------------------------
// Validated (server-trusted) shapes
// ---------------------------------------------------------------------------
export type ValidQuestion = {
  position: number;
  eyebrow: string | null;
  text: string;
  time_limit_seconds: number;
  points_base: number;
  choices: { key: string; label: string }[];
  correct_key: string;
};

export type ValidQuiz = {
  title: string;
  description: string | null;
  is_published: boolean;
  questions: ValidQuestion[];
};

export type ParseResult =
  | { ok: true; quiz: ValidQuiz }
  | { ok: false; error: string };

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// Parse + validate the JSON blob posted by the editor form. This is the single
// server-side trust boundary for quiz authoring: it normalizes choice keys to
// the canonical a/b/c/d sequence (so the client can't smuggle weird keys),
// enforces exactly 4 choices, a valid correct_key, non-empty text, and clamps numeric
// fields into safe ranges. Returns a Japanese error message on failure.
export function parseQuizPayload(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "フォームの形式が不正です" };
  }
  if (typeof data !== "object" || data === null) {
    return { ok: false, error: "フォームの形式が不正です" };
  }

  const obj = data as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (title.length === 0) return { ok: false, error: "クイズのタイトルを入力してください" };
  if (title.length > TITLE_MAX)
    return { ok: false, error: `タイトルは${TITLE_MAX}文字以内で入力してください` };

  const descRaw = typeof obj.description === "string" ? obj.description.trim() : "";
  if (descRaw.length > DESCRIPTION_MAX)
    return { ok: false, error: `説明は${DESCRIPTION_MAX}文字以内で入力してください` };
  const description = descRaw.length > 0 ? descRaw : null;

  const is_published = obj.is_published === true;

  const rawQuestions = Array.isArray(obj.questions) ? obj.questions : [];
  if (rawQuestions.length === 0)
    return { ok: false, error: "問題を1問以上追加してください" };
  if (rawQuestions.length > MAX_QUESTIONS)
    return { ok: false, error: `問題は${MAX_QUESTIONS}問までです` };

  const questions: ValidQuestion[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const q = rawQuestions[i];
    const where = `問題${i + 1}`;
    if (typeof q !== "object" || q === null)
      return { ok: false, error: `${where}の形式が不正です` };
    const qo = q as Record<string, unknown>;

    const text = typeof qo.text === "string" ? qo.text.trim() : "";
    if (text.length === 0) return { ok: false, error: `${where}の問題文を入力してください` };
    if (text.length > QUESTION_TEXT_MAX)
      return { ok: false, error: `${where}の問題文が長すぎます` };

    const time_limit_seconds = clampInt(
      qo.time_limit_seconds,
      MIN_TIME_LIMIT,
      MAX_TIME_LIMIT,
      DEFAULT_TIME_LIMIT,
    );
    const points_base = clampInt(
      qo.points_base,
      MIN_POINTS,
      MAX_POINTS,
      DEFAULT_POINTS_BASE,
    );

    const rawChoices = Array.isArray(qo.choices) ? qo.choices : [];
    if (rawChoices.length !== FIXED_CHOICE_COUNT)
      return {
        ok: false,
        error: `${where}の答えは4つ入力してください`,
      };

    // Normalize keys to the canonical a/b/c/d sequence by position. The client's
    // declared correct_key is matched against the *original* key it sent, then
    // re-pointed to the canonical key — so reordering on the client is safe.
    const choices: { key: string; label: string }[] = [];
    let correctIndex = -1;
    const declaredCorrect =
      typeof qo.correct_key === "string" ? qo.correct_key : "";

    for (let c = 0; c < rawChoices.length; c++) {
      const ch = rawChoices[c];
      const cho = (typeof ch === "object" && ch !== null
        ? (ch as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const label = typeof cho.label === "string" ? cho.label.trim() : "";
      if (label.length === 0)
        return { ok: false, error: `${where}の選択肢${c + 1}を入力してください` };
      if (label.length > CHOICE_LABEL_MAX)
        return { ok: false, error: `${where}の選択肢${c + 1}が長すぎます` };
      const originalKey = typeof cho.key === "string" ? cho.key : "";
      if (originalKey.length > 0 && originalKey === declaredCorrect)
        correctIndex = c;
      choices.push({ key: keyForIndex(c), label });
    }

    if (correctIndex < 0)
      return { ok: false, error: `${where}の正解を選んでください` };

    questions.push({
      position: i,
      eyebrow: null,
      text,
      time_limit_seconds,
      points_base,
      choices,
      correct_key: keyForIndex(correctIndex),
    });
  }

  return {
    ok: true,
    quiz: { title, description, is_published, questions },
  };
}

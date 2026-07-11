// Plain (non-"use server") helpers + types for invite-gated quiz authoring.
//
// The admin invite cookie gates the UI, while Supabase auth.uid() ownership gates
// the database RPCs. The editor is the only UI path that receives correct_key
// (via get_quiz_for_edit).
//
// Kept out of any "use server" module so it can export plain (sync) functions
// and types. The generated Database type may not yet include the new RPCs, so we
// declare the wire shapes here and cast .rpc(...) results in the islands.

import {
  CHOICE_KEYS,
  DEFAULT_POINTS_BASE,
  DEFAULT_TIME_LIMIT,
  FIXED_CHOICE_COUNT,
  type DraftChoice,
  type DraftQuestion,
  type DraftQuiz,
  keyForIndex,
} from "./quiz-form";

// ---------------------------------------------------------------------------
// RPC wire shapes (declared locally; generated Database type lags the migration)
// ---------------------------------------------------------------------------

// create_quiz(p_title, p_description) RETURNS TABLE(quiz_id)
export type CreateQuizRow = { quiz_id: string };

// One question returned by get_quiz_for_edit. This is the only read shape that
// carries correct_key.
export type EditQuestion = {
  id: string;
  position: number;
  eyebrow: string | null;
  text: string;
  choices: { key: string; label: string; image_url?: string | null }[];
  correct_key: string;
  time_limit_seconds: number | null;
  points_base: number;
  media_url?: string | null;
};

// One question sent to save_quiz. Existing rows carry their stable id. Image
// fields are omitted when unchanged, null when explicitly removed, and a URL
// when replaced.
export type SaveQuestion = {
  id?: string;
  position: number;
  eyebrow: string | null;
  text: string;
  choices: { key: string; label: string; image_url?: string | null }[];
  correct_key: string;
  time_limit_seconds: number | null;
  points_base: number;
  media_url?: string | null;
};

// get_quiz_for_edit(p_quiz_id) RETURNS jsonb
export type QuizForEdit = {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  questions: EditQuestion[];
};

// Build the canonical admin editor path for a quiz.
export function editLinkPath(quizId: string): string {
  return `/admin/quizzes/${quizId}`;
}

// ---------------------------------------------------------------------------
// Conversion between the RPC shapes and the editor's DraftQuiz state.
// ---------------------------------------------------------------------------

// Map a get_quiz_for_edit payload into the editor's DraftQuiz. Unlike the old
// owner editor, correct_key IS available here (the RPC returns it), so we can
// pre-select the right answer.
export function quizForEditToDraft(quiz: QuizForEdit): DraftQuiz {
  const questions: DraftQuestion[] = (quiz.questions ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((q) => {
      const rawChoices = Array.isArray(q.choices) ? q.choices : [];
      if (rawChoices.length !== FIXED_CHOICE_COUNT) {
        throw new Error("クイズデータが4択形式ではありません");
      }
      const choices: DraftChoice[] = rawChoices.map((c, i) => ({
        key: keyForIndex(i),
        label: typeof c?.label === "string" ? c.label : "",
        image_url: typeof c?.image_url === "string" ? c.image_url : null,
        image_changed: false,
      }));
      // Keep correct_key only if it matches one of the choice keys.
      const correct_key = choices.some((c) => c.key === q.correct_key)
        ? q.correct_key
        : "";
      return {
        id: q.id,
        text: q.text,
        // null = 手動 (manual). Preserve it; only fall back to the default when
        // the field is genuinely missing (undefined), not when it's null.
        time_limit_seconds: q.time_limit_seconds === undefined ? DEFAULT_TIME_LIMIT : q.time_limit_seconds,
        points_base: q.points_base || DEFAULT_POINTS_BASE,
        choices,
        correct_key,
        media_url: typeof q.media_url === "string" ? q.media_url : null,
        media_changed: false,
      };
    });

  return {
    title: quiz.title,
    description: quiz.description ?? "",
    is_published: quiz.is_published,
    questions: questions.length > 0 ? questions : [emptyDraftQuestion()],
  };
}

// A blank question scaffold for an empty editor (4 choices, none correct yet).
export function emptyDraftQuestion(): DraftQuestion {
  return {
    text: "",
    time_limit_seconds: DEFAULT_TIME_LIMIT,
    points_base: DEFAULT_POINTS_BASE,
    choices: [
      { key: CHOICE_KEYS[0], label: "" },
      { key: CHOICE_KEYS[1], label: "" },
      { key: CHOICE_KEYS[2], label: "" },
      { key: CHOICE_KEYS[3], label: "" },
    ],
    correct_key: CHOICE_KEYS[0],
  };
}

// Serialize the editor's DraftQuiz into the p_questions JSON that save_quiz
// expects: contiguous positions, exactly four canonical a/b/c/d choice keys, and
// correct_key re-pointed to the canonical key. The RPC
// re-validates server-side; this is a clean client-side projection.
export function draftToSaveQuestions(draft: DraftQuiz): SaveQuestion[] {
  return draft.questions.map((q, i) => {
    if (q.choices.length !== FIXED_CHOICE_COUNT) {
      throw new Error("答えは4つ入力してください");
    }
    const choices = q.choices.map((c, ci) => {
      const choice: SaveQuestion["choices"][number] = {
        key: keyForIndex(ci),
        label: c.label.trim(),
      };
      if (!q.id || c.image_changed) choice.image_url = c.image_url ?? null;
      return choice;
    });
    // Find where the chosen correct choice landed after re-keying.
    const correctIndex = q.choices.findIndex((c) => c.key === q.correct_key);
    const correct_key =
      correctIndex >= 0 ? keyForIndex(correctIndex) : choices[0]?.key ?? "a";
    const question: SaveQuestion = {
      ...(q.id ? { id: q.id } : {}),
      position: i,
      eyebrow: null,
      text: q.text.trim(),
      choices,
      correct_key,
      time_limit_seconds: q.time_limit_seconds,
      points_base: q.points_base,
    };
    if (!q.id || q.media_changed) question.media_url = q.media_url ?? null;
    return question;
  });
}

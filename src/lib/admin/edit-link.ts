// Plain (non-"use server") helpers + types for the login-free edit-link model.
//
// The authoring model has NO login: each quiz carries a secret per-quiz
// `edit_token` (a uuid). Knowing the edit-link — `/admin/quizzes/{quizId}?t={token}`
// — IS the capability to edit (Google-Docs "anyone with the link"). All reads/
// writes go through SECURITY DEFINER RPCs that validate the token; the editor is
// the ONLY place correct_key is ever surfaced (via get_quiz_for_edit).
//
// Kept out of any "use server" module so it can export plain (sync) functions
// and types. The generated Database type may not yet include the new RPCs, so we
// declare the wire shapes here and cast .rpc(...) results in the islands.

import {
  CHOICE_KEYS,
  DEFAULT_POINTS_BASE,
  DEFAULT_TIME_LIMIT,
  type DraftChoice,
  type DraftQuestion,
  type DraftQuiz,
  keyForIndex,
} from "./quiz-form";

// The caveat shown on EVERY edit surface. Anyone with the link can edit, so we
// must warn against entering secrets. Single source of truth so the copy stays
// identical across /admin and the editor.
export const EDIT_LINK_CAVEAT =
  "⚠️ このリンクを知っている人は誰でも編集できます。パスワードなどの機密情報は入力しないでください。";

// ---------------------------------------------------------------------------
// RPC wire shapes (declared locally; generated Database type lags the migration)
// ---------------------------------------------------------------------------

// create_quiz(p_title, p_description) RETURNS TABLE(quiz_id, edit_token)
export type CreateQuizRow = { quiz_id: string; edit_token: string };

// One question as returned by get_quiz_for_edit / sent to save_quiz. This is the
// ONLY shape that carries correct_key on the read side.
export type EditQuestion = {
  position: number;
  eyebrow: string | null;
  text: string;
  choices: { key: string; label: string }[];
  correct_key: string;
  time_limit_seconds: number;
  points_base: number;
};

// get_quiz_for_edit(p_quiz_id, p_edit_token) RETURNS jsonb
export type QuizForEdit = {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  edit_token: string;
  questions: EditQuestion[];
};

// ---------------------------------------------------------------------------
// Edit-link parsing — accept either a full URL or a bare token, and pull out the
// quizId + token so the /admin "既存のリンクを開く" field is forgiving.
// ---------------------------------------------------------------------------
export type ParsedEditLink = { quizId: string; token: string };

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Parse a pasted edit-link. Handles:
//   - a full URL: https://host/admin/quizzes/<quizId>?t=<token>
//   - a relative path: /admin/quizzes/<quizId>?t=<token>
//   - just the "<quizId>?t=<token>" tail
// Returns null when a quizId + token pair can't be recovered.
export function parseEditLink(input: string): ParsedEditLink | null {
  const raw = input.trim();
  if (raw.length === 0) return null;

  // Try to interpret as a URL (absolute or relative against a dummy base).
  let pathname = raw;
  let token = "";
  try {
    const url = new URL(raw, "https://x.invalid");
    pathname = url.pathname;
    token = url.searchParams.get("t") ?? "";
  } catch {
    // Not URL-shaped; fall through to manual splitting below.
    const qIndex = raw.indexOf("?");
    if (qIndex >= 0) {
      pathname = raw.slice(0, qIndex);
      const query = new URLSearchParams(raw.slice(qIndex + 1));
      token = query.get("t") ?? "";
    }
  }

  // quizId = the last uuid found in the path (….../admin/quizzes/<quizId>).
  const pathMatches = pathname.match(UUID_RE);
  const quizId = pathMatches ? pathMatches[0] : "";

  if (!UUID_RE.test(quizId) || !UUID_RE.test(token)) return null;
  return { quizId, token };
}

// Build the canonical edit-link path for a quiz (used for the share link/copy).
export function editLinkPath(quizId: string, token: string): string {
  return `/admin/quizzes/${quizId}?t=${token}`;
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
      const choices: DraftChoice[] = rawChoices.map((c, i) => ({
        key: typeof c?.key === "string" ? c.key : keyForIndex(i),
        label: typeof c?.label === "string" ? c.label : "",
      }));
      const safeChoices =
        choices.length > 0
          ? choices
          : [
              { key: "a", label: "" },
              { key: "b", label: "" },
            ];
      // Keep correct_key only if it matches one of the choice keys.
      const correct_key = safeChoices.some((c) => c.key === q.correct_key)
        ? q.correct_key
        : "";
      return {
        eyebrow: q.eyebrow ?? "",
        text: q.text,
        time_limit_seconds: q.time_limit_seconds || DEFAULT_TIME_LIMIT,
        points_base: q.points_base || DEFAULT_POINTS_BASE,
        choices: safeChoices,
        correct_key,
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
    eyebrow: "",
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
// expects: contiguous positions, canonical a/b/c… choice keys, correct_key
// re-pointed to the (possibly reordered/removed) canonical key. The RPC
// re-validates server-side; this is a clean client-side projection.
export function draftToSaveQuestions(draft: DraftQuiz): EditQuestion[] {
  return draft.questions.map((q, i) => {
    const choices = q.choices.map((c, ci) => ({
      key: keyForIndex(ci),
      label: c.label.trim(),
    }));
    // Find where the chosen correct choice landed after re-keying.
    const correctIndex = q.choices.findIndex((c) => c.key === q.correct_key);
    const correct_key =
      correctIndex >= 0 ? keyForIndex(correctIndex) : choices[0]?.key ?? "a";
    const eyebrow = q.eyebrow.trim();
    return {
      position: i,
      eyebrow: eyebrow.length > 0 ? eyebrow : null,
      text: q.text.trim(),
      choices,
      correct_key,
      time_limit_seconds: q.time_limit_seconds,
      points_base: q.points_base,
    };
  });
}

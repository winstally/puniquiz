"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CHOICE_THEME, QUESTION_IMAGE_ASPECT } from "@/lib/quiz";
import { uploadQuizMedia, validateImageFile } from "@/lib/admin/upload-media";
import { ImagePlus, X } from "lucide-react";
import {
  AnswerChoiceCard,
  AnswerChoiceCheckButton,
  AnswerChoiceImagePicker,
  AnswerChoiceRemoveImageButton,
  AnswerChoiceText,
} from "@/components/AnswerChoiceCard";
import {
  type DraftChoice,
  type DraftQuestion,
  type DraftQuiz,
} from "@/lib/admin/quiz-form";
import {
  draftToSaveQuestions,
  emptyDraftQuestion,
  quizForEditToDraft,
} from "@/lib/admin/quiz-authoring";
import {
  validateSaveQuizInput,
  type SaveQuizInput,
} from "@/lib/admin/quiz-validation";
import { forgetQuiz, rememberQuiz } from "@/lib/admin/recent-quizzes";
import { ConfirmDialog, ConfirmDialogLayer } from "@/components/ConfirmDialog";
import { loadQuizForEditAction, saveQuizAction } from "@/app/actions";
import { AdminBrand } from "@/app/admin/AdminBrand";
import { AdminShell } from "@/app/admin/AdminShell";
import { InlineFieldError } from "./InlineFieldError";
import { PointsDial, TimeLimitDial } from "./TimeLimitDial";
import {
  cardStyle,
  eyebrowStyle,
  ghostPill,
  inputStyle,
  labelStyle,
  plumPill,
} from "@/app/admin/admin-styles";

// CHOICE accent per index, matching the play/host palette order. Kept local so
// the editor doesn't import client visual components.
type LoadState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | { kind: "ready"; draft: DraftQuiz };

type FieldErrors = Record<string, string>;

type QuizEditorIslandProps = {
  quizId: string;
  inviteLinkPath: string;
};

// A large, centered dropzone (not a tiny pill) so adding a question image is an
// obvious target. Same footprint as the preview below, so nothing shifts once an
// image is chosen.
// Centered in the form (alignSelf) with a capped width so it reads as a framed
// dropzone, not a full-bleed band.
const QUESTION_IMAGE_BOX = {
  width: "100%",
  maxWidth: 420,
  aspectRatio: QUESTION_IMAGE_ASPECT, // fixed 16:10 frame (SSOT), same as the host screen
  alignSelf: "center" as const,
  background: "color-mix(in oklch, var(--plum) 4%, #fff)", // letterbox behind contained images
};

const errorSummaryStyle = {
  borderRadius: 12,
  border: "1.5px solid color-mix(in oklch, var(--rose) 44%, var(--line))",
  background: "color-mix(in oklch, var(--rose) 9%, white)",
  color: "var(--rose-deep)",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.5,
  padding: "12px 14px",
} as const;

const fieldKey = {
  title: "title",
  description: "description",
  questions: "questions",
  questionText: (qi: number) => `questions.${qi}.text`,
  questionChoices: (qi: number) => `questions.${qi}.choices`,
  questionCorrect: (qi: number) => `questions.${qi}.correct_key`,
  questionTime: (qi: number) => `questions.${qi}.time_limit_seconds`,
  questionPoints: (qi: number) => `questions.${qi}.points_base`,
  choiceLabel: (qi: number, ci: number) => `questions.${qi}.choices.${ci}.label`,
} as const;

function fieldAnchorId(key: string): string {
  return `quiz-field-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function fieldErrorId(key: string): string {
  return `${fieldAnchorId(key)}-error`;
}

function invalidInputStyle(hasError: boolean) {
  return hasError
    ? {
        border: "1.5px solid var(--rose)",
        boxShadow: "0 0 0 3px color-mix(in oklch, var(--rose) 18%, transparent)",
      }
    : {};
}

function scrollToFirstError(errors: FieldErrors) {
  const firstKey = Object.keys(errors)[0];
  if (!firstKey) return;
  window.requestAnimationFrame(() => {
    document.getElementById(fieldAnchorId(firstKey))?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
}

const questionImageUploadLabelStyle = {
  ...QUESTION_IMAGE_BOX,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  borderRadius: 18,
  border: "2px dashed color-mix(in srgb, var(--ink-soft) 30%, var(--line))",
  background: "#fbfafe",
  color: "var(--ink-soft)",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
} as const;

const imageRemoveButtonStyle = {
  position: "absolute",
  top: -8,
  right: -8,
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "#fff",
  boxShadow: "var(--shadow-card)",
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
  color: "var(--ink-soft)",
} as const;

async function uploadPendingImages(draft: DraftQuiz): Promise<DraftQuiz> {
  const questions = await Promise.all(
    draft.questions.map(async (q, qi): Promise<DraftQuestion> => {
      const [media_url, choices] = await Promise.all([
        q.media_file
          ? uploadQuizMediaWithLabel(q.media_file, `問題${qi + 1}の画像`)
          : Promise.resolve(q.media_url ?? null),
        Promise.all(
          q.choices.map(async (c, ci): Promise<DraftChoice> => ({
            ...c,
            image_url: c.image_file
              ? await uploadQuizMediaWithLabel(c.image_file, `問題${qi + 1}の答え${ci + 1}の画像`)
              : (c.image_url ?? null),
            image_file: null,
            image_preview_url: null,
          })),
        ),
      ]);

      return {
        ...q,
        media_url,
        media_file: null,
        media_preview_url: null,
        choices,
      };
    }),
  );

  return { ...draft, questions };
}

async function uploadQuizMediaWithLabel(file: File, label: string): Promise<string> {
  try {
    return await uploadQuizMedia(file);
  } catch (e) {
    const message = e instanceof Error ? e.message : "アップロードに失敗しました";
    throw new Error(`${label}: ${message}`);
  }
}

function useQuizEditorView({
  quizId,
  inviteLinkPath,
}: QuizEditorIslandProps) {
  const router = useRouter();
  // A missing quizId is decided at render time (no setState-in-effect), so the
  // effect only ever runs the async fetch when it is present.
  const hasQuizId = Boolean(quizId);
  const [state, setState] = useState<LoadState>(() =>
    hasQuizId ? { kind: "loading" } : { kind: "invalid" },
  );
  const [saving, startSave] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [previewUrls] = useState(() => new Set<string>());
  // True right after a successful save with no edits since — the primary button
  // then offers "もどる" instead of "保存".
  const [savedClean, setSavedClean] = useState(false);

  // ---- load the quiz via invite-gated Server Action ------------------------
  useEffect(() => {
    if (!hasQuizId) return;
    let cancelled = false;
    (async () => {
      const res = await loadQuizForEditAction(quizId);
      if (cancelled) return;
      if (!res.ok) {
        setState(res.invalid ? { kind: "invalid" } : { kind: "error", message: res.error });
        return;
      }
      const quiz = res.quiz;
      // Remember this quiz locally (invite confirmed) so it shows up in the
      // "編集を続ける" list and the host launcher next time.
      rememberQuiz({ quizId, title: quiz.title });
      try {
        setState({ kind: "ready", draft: quizForEditToDraft(quiz) });
      } catch (e) {
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "クイズデータを読み込めませんでした",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, hasQuizId]);

  useEffect(() => {
    const urls = previewUrls;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, [previewUrls]);

  if (state.kind === "loading") {
    return renderEditorLoading();
  }

  if (state.kind === "invalid" || state.kind === "error") {
    return renderEditorUnavailable({ state });
  }

  const draft = state.draft;

  function setDraft(updater: (d: DraftQuiz) => DraftQuiz) {
    setSavedClean(false); // any edit makes the quiz dirty again
    setState((s) => (s.kind === "ready" ? { kind: "ready", draft: updater(s.draft) } : s));
  }

  function clearFieldErrors(keys: string[]) {
    setFieldErrors((current) => {
      let changed = false;
      const next = { ...current };
      for (const key of keys) {
        if (key in next) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  function showFieldErrors(errors: FieldErrors, fallback: string) {
    setFieldErrors(errors);
    toast.error(Object.keys(errors).length > 0 ? "入力内容を確認してください" : fallback);
    scrollToFirstError(errors);
  }

  function saveInputFromDraft(inputDraft: DraftQuiz): SaveQuizInput {
    return {
      quizId,
      title: inputDraft.title.trim(),
      description: inputDraft.description.trim() || null,
      questions: draftToSaveQuestions(inputDraft),
    };
  }

  // ---- quiz-level setters --------------------------------------------------
  function patchQuiz(patch: Partial<DraftQuiz>) {
    const keys: string[] = [];
    if ("title" in patch) keys.push(fieldKey.title);
    if ("description" in patch) keys.push(fieldKey.description);
    clearFieldErrors(keys);
    setDraft((d) => ({ ...d, ...patch }));
  }

  // ---- question-level helpers ---------------------------------------------
  function patchQuestion(qi: number, patch: Partial<DraftQuestion>) {
    const keys: string[] = [];
    if ("text" in patch) keys.push(fieldKey.questionText(qi));
    if ("correct_key" in patch) keys.push(fieldKey.questionCorrect(qi));
    if ("time_limit_seconds" in patch) keys.push(fieldKey.questionTime(qi));
    if ("points_base" in patch) keys.push(fieldKey.questionPoints(qi));
    clearFieldErrors(keys);
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)),
    }));
  }

  function addQuestion() {
    setFieldErrors({});
    setDraft((d) => ({ ...d, questions: [...d.questions, emptyDraftQuestion()] }));
  }

  function removeQuestion(qi: number) {
    if (state.kind !== "ready" || state.draft.questions.length <= 1) return;
    const removed = state.draft.questions[qi];
    if (removed?.media_preview_url) {
      URL.revokeObjectURL(removed.media_preview_url);
      previewUrls.delete(removed.media_preview_url);
    }
    removed?.choices.forEach((c) => {
      if (!c.image_preview_url) return;
      URL.revokeObjectURL(c.image_preview_url);
      previewUrls.delete(c.image_preview_url);
    });
    setFieldErrors({});
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== qi) }));
  }

  function moveQuestion(qi: number, dir: -1 | 1) {
    setFieldErrors({});
    setDraft((d) => {
      const next = qi + dir;
      if (next < 0 || next >= d.questions.length) return d;
      const questions = [...d.questions];
      const [moved] = questions.splice(qi, 1);
      questions.splice(next, 0, moved);
      return { ...d, questions };
    });
  }

  // ---- choice-level helpers (keys re-canonicalized on save) ----------------
  function patchChoiceLabel(qi: number, ci: number, label: string) {
    clearFieldErrors([fieldKey.choiceLabel(qi, ci), fieldKey.questionChoices(qi)]);
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) =>
        i === qi
          ? {
              ...q,
              choices: q.choices.map((c, j) => (j === ci ? { ...c, label } : c)),
            }
          : q,
      ),
    }));
  }

  function setCorrect(qi: number, key: string) {
    clearFieldErrors([fieldKey.questionCorrect(qi)]);
    patchQuestion(qi, { correct_key: key });
  }

  function patchChoice(qi: number, ci: number, patch: Partial<DraftChoice>) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) =>
        i === qi
          ? { ...q, choices: q.choices.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
          : q,
      ),
    }));
  }

  // Stage images locally. Storage upload happens only from the Save button.
  function stageImage(file: File, apply: (file: File, previewUrl: string) => void) {
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    previewUrls.add(previewUrl);
    apply(file, previewUrl);
  }

  function revokePreview(url: string | null | undefined) {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrls.delete(url);
  }

  // ---- save (save_quiz RPC) ------------------------------------------------
  function onSave() {
    let pendingInput: SaveQuizInput;
    try {
      pendingInput = saveInputFromDraft(draft);
    } catch (e) {
      showFieldErrors(
        { [fieldKey.questions]: e instanceof Error ? e.message : "問題の入力内容を確認してください" },
        "問題の入力内容を確認してください",
      );
      return;
    }
    const validation = validateSaveQuizInput(pendingInput);
    if (!validation.ok) {
      showFieldErrors(validation.fieldErrors, validation.error);
      return;
    }
    setFieldErrors({});

    startSave(async () => {
      let uploadedDraft: DraftQuiz;
      try {
        uploadedDraft = await uploadPendingImages(draft);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "画像をアップロードできませんでした");
        return;
      }

      const uploadedInput = saveInputFromDraft(uploadedDraft);
      const uploadedValidation = validateSaveQuizInput(uploadedInput);
      if (!uploadedValidation.ok) {
        showFieldErrors(uploadedValidation.fieldErrors, uploadedValidation.error);
        return;
      }

      const res = await saveQuizAction(uploadedValidation.data);
      if (!res.ok) {
        if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) {
          showFieldErrors(res.fieldErrors, res.error);
          return;
        }
        toast.error(res.error);
        return;
      }
      draft.questions.forEach((q) => {
        revokePreview(q.media_preview_url);
        q.choices.forEach((c) => revokePreview(c.image_preview_url));
      });
      const savedDraft = quizForEditToDraft(res.quiz);
      setState({ kind: "ready", draft: savedDraft });
      setFieldErrors({});
      // Keep the locally-remembered title fresh after a save.
      rememberQuiz({ quizId, title: savedDraft.title.trim() });
      toast.success("保存しました");
      // Stay on the page; the primary button now offers "もどる".
      setSavedClean(true);
    });
  }

  // ---- back to the studio --------------------------------------------------
  function onBack() {
    router.push("/admin");
  }

  // ---- delete (remove from this device) ------------------------------------
  // No destructive server-side delete here; this drops the local bookmark.
  // Confirmed via an alert dialog.
  function onRemoveFromList() {
    forgetQuiz(quizId);
    setConfirmRemove(false);
    toast.success("削除しました");
    router.push("/admin");
  }

  // ---- copy invite-backed edit link ----------------------------------------
  async function onCopyLink() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${inviteLinkPath}`
        : inviteLinkPath;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("編集リンクをコピーしました");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーできませんでした");
    }
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${inviteLinkPath}`
      : inviteLinkPath;

  return renderQuizEditorReady({
    draft,
    shareUrl,
    copied,
    saving,
    confirmRemove,
    setConfirmRemove,
    patchQuiz,
    patchQuestion,
    addQuestion,
    removeQuestion,
    moveQuestion,
    patchChoiceLabel,
    setCorrect,
    patchChoice,
    stageImage,
    revokePreview,
    fieldErrors,
    onCopyLink,
    onSave,
    onBack,
    savedClean,
    onRemoveFromList,
  });
}

// The quiz editor island. The route checks the admin invite cookie before this
// mounts; save/load also go through cookie-checked Server Actions.
export function QuizEditorIsland(props: QuizEditorIslandProps) {
  return useQuizEditorView(props);
}

function renderEditorLoading() {
  return renderEditorShell(
      <div style={{ ...cardStyle, alignItems: "center", padding: "48px 24px" }}>
        <p style={{ color: "var(--ink-soft)", fontWeight: 700, margin: 0 }}>
          読み込み中…
        </p>
      </div>
  );
}

function renderEditorUnavailable({
  state,
}: {
  state: Extract<LoadState, { kind: "invalid" | "error" }>;
}) {
  return renderEditorShell(
    <div
      style={{
        ...cardStyle,
        alignItems: "center",
        textAlign: "center",
        padding: "48px 24px",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 40 }}>🔒</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, margin: 0, color: "var(--ink)" }}>
        {state.kind === "invalid"
          ? "クイズが見つかりません"
          : "読み込みに失敗しました"}
      </h2>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
        {state.kind === "invalid"
          ? "URLが間違っているか、クイズが削除された可能性があります。"
          : state.message}
      </p>
      <Link href="/admin" style={{ textDecoration: "none", marginTop: 6 }}>
        <Button type="button" style={{ ...plumPill, fontSize: 15 }}>
          トップへ戻る
        </Button>
      </Link>
    </div>,
  );
}

function renderQuizEditorReady({
  draft,
  shareUrl,
  copied,
  saving,
  confirmRemove,
  setConfirmRemove,
  patchQuiz,
  patchQuestion,
  addQuestion,
  removeQuestion,
  moveQuestion,
  patchChoiceLabel,
  setCorrect,
  patchChoice,
  stageImage,
  revokePreview,
  fieldErrors,
  onCopyLink,
  onSave,
  onBack,
  savedClean,
  onRemoveFromList,
}: {
  draft: DraftQuiz;
  shareUrl: string;
  copied: boolean;
  saving: boolean;
  confirmRemove: boolean;
  setConfirmRemove: (open: boolean) => void;
  patchQuiz: (patch: Partial<DraftQuiz>) => void;
  patchQuestion: (qi: number, patch: Partial<DraftQuestion>) => void;
  addQuestion: () => void;
  removeQuestion: (qi: number) => void;
  moveQuestion: (qi: number, dir: -1 | 1) => void;
  patchChoiceLabel: (qi: number, ci: number, label: string) => void;
  setCorrect: (qi: number, key: string) => void;
  patchChoice: (qi: number, ci: number, patch: Partial<DraftChoice>) => void;
  stageImage: (file: File, apply: (file: File, previewUrl: string) => void) => void;
  revokePreview: (url: string | null | undefined) => void;
  fieldErrors: FieldErrors;
  onCopyLink: () => Promise<void>;
  onSave: () => void;
  onBack: () => void;
  savedClean: boolean;
  onRemoveFromList: () => void;
}) {
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const titleError = fieldErrors[fieldKey.title];
  const descriptionError = fieldErrors[fieldKey.description];

  return renderEditorShell(
    <>
      <section style={{ marginBottom: 4 }}>
        <Link href="/admin" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", textDecoration: "none" }}>
          ← トップへ戻る
        </Link>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(24px, 4vw, 32px)", margin: "8px 0 0", color: "var(--ink)" }}>
          クイズを編集
        </h2>
      </section>

      <div style={{ ...cardStyle, gap: 12, border: "1.5px solid color-mix(in oklch, var(--plum) 24%, var(--line))" }}>
        <div style={eyebrowStyle}>編集リンク</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{ ...inputStyle, flex: "1 1 260px", fontFamily: "var(--font-mono)", fontSize: 13, padding: "11px 14px" }}
            aria-label="編集リンク"
          />
          <Button type="button" onClick={onCopyLink} style={{ ...plumPill, fontSize: 14, padding: "11px 18px" }}>
            {copied ? "コピーしました" : "編集リンクをコピー"}
          </Button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={eyebrowStyle}>クイズの情報</div>
        <label id={fieldAnchorId(fieldKey.title)} style={labelStyle}>
          <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>タイトル</span>
          <input
            value={draft.title}
            onChange={(e) => patchQuiz({ title: e.target.value })}
            placeholder="かわいいスイーツ早押しクイズ"
            aria-invalid={Boolean(titleError) || undefined}
            aria-describedby={titleError ? fieldErrorId(fieldKey.title) : undefined}
            style={{ ...inputStyle, ...invalidInputStyle(Boolean(titleError)) }}
            maxLength={80}
          />
          <InlineFieldError id={fieldErrorId(fieldKey.title)} message={titleError} />
        </label>
        <label id={fieldAnchorId(fieldKey.description)} style={labelStyle}>
          <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>説明（任意）</span>
          <textarea
            value={draft.description}
            onChange={(e) => patchQuiz({ description: e.target.value })}
            placeholder="どんなクイズか一言で"
            rows={2}
            aria-invalid={Boolean(descriptionError) || undefined}
            aria-describedby={descriptionError ? fieldErrorId(fieldKey.description) : undefined}
            style={{
              ...inputStyle,
              ...invalidInputStyle(Boolean(descriptionError)),
              resize: "vertical",
              lineHeight: 1.5,
            }}
            maxLength={280}
          />
          <InlineFieldError id={fieldErrorId(fieldKey.description)} message={descriptionError} />
        </label>
      </div>

      {draft.questions.map((q, qi) =>
        renderQuestionEditor({
          key: qi,
          q,
          qi,
          questionCount: draft.questions.length,
          patchQuestion,
          removeQuestion,
          moveQuestion,
          patchChoiceLabel,
          setCorrect,
          patchChoice,
          stageImage,
          revokePreview,
          fieldErrors,
        }),
      )}

      {hasFieldErrors ? (
        <div role="alert" style={errorSummaryStyle}>
          未入力または範囲外の項目があります。赤字の項目を確認してください。
        </div>
      ) : null}

      {/* Bottom actions, one row: edit/primary grouped on the left (add-question +
          save), and the destructive delete pushed to the far right so it can't be
          mistaken for — or mis-tapped next to — save. Wraps on narrow screens. */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
        <Button type="button" onClick={savedClean ? onBack : onSave} disabled={saving} style={{ ...plumPill, fontSize: 16, padding: "14px 28px" }}>
          {saving ? "保存中…" : savedClean ? "もどる" : "保存"}
        </Button>
        <Button type="button" onClick={addQuestion} style={{ ...ghostPill, fontSize: 14, padding: "12px 20px" }}>
          ＋ 問題を追加
        </Button>
        <div style={{ marginLeft: "auto" }}>
          <Button
            type="button"
            onClick={() => setConfirmRemove(true)}
            style={{
              ...ghostPill,
              fontSize: 14,
              padding: "12px 18px",
              color: "var(--rose-deep)",
              border: "1.5px solid color-mix(in oklch, var(--rose) 35%, var(--line))",
            }}
          >
            クイズを削除
          </Button>
        </div>
      </div>

      <ConfirmDialogLayer open={confirmRemove}>
        <ConfirmDialog
          title="このクイズを削除しますか？"
          description="この端末の一覧から削除します。クイズ本体は残ります。"
          confirmLabel="削除"
          cancelLabel="キャンセル"
          confirmTone="rose"
          pending={false}
          onConfirm={onRemoveFromList}
          onCancel={() => setConfirmRemove(false)}
        />
      </ConfirmDialogLayer>
    </>,
  );
}

function renderQuestionEditor({
  key,
  q,
  qi,
  questionCount,
  patchQuestion,
  removeQuestion,
  moveQuestion,
  patchChoiceLabel,
  setCorrect,
  patchChoice,
  stageImage,
  revokePreview,
  fieldErrors,
}: {
  key: number;
  q: DraftQuestion;
  qi: number;
  questionCount: number;
  patchQuestion: (qi: number, patch: Partial<DraftQuestion>) => void;
  removeQuestion: (qi: number) => void;
  moveQuestion: (qi: number, dir: -1 | 1) => void;
  patchChoiceLabel: (qi: number, ci: number, label: string) => void;
  setCorrect: (qi: number, key: string) => void;
  patchChoice: (qi: number, ci: number, patch: Partial<DraftChoice>) => void;
  stageImage: (file: File, apply: (file: File, previewUrl: string) => void) => void;
  revokePreview: (url: string | null | undefined) => void;
  fieldErrors: FieldErrors;
}) {
  const questionImage = q.media_preview_url ?? q.media_url;
  const textKey = fieldKey.questionText(qi);
  const choicesKey = fieldKey.questionChoices(qi);
  const correctKey = fieldKey.questionCorrect(qi);
  const timeKey = fieldKey.questionTime(qi);
  const pointsKey = fieldKey.questionPoints(qi);
  const textError = fieldErrors[textKey];
  const choicesError = fieldErrors[choicesKey];
  const correctError = fieldErrors[correctKey];
  const timeError = fieldErrors[timeKey];
  const pointsError = fieldErrors[pointsKey];

  return (
    <div key={key} style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={eyebrowStyle}>問題 {qi + 1}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button type="button" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0} style={{ ...ghostPill, padding: "7px 12px", fontSize: 13 }} aria-label="上へ移動">
            ↑
          </Button>
          <Button type="button" onClick={() => moveQuestion(qi, 1)} disabled={qi === questionCount - 1} style={{ ...ghostPill, padding: "7px 12px", fontSize: 13 }} aria-label="下へ移動">
            ↓
          </Button>
          <Button
            type="button"
            onClick={() => removeQuestion(qi)}
            disabled={questionCount <= 1}
            style={{ ...ghostPill, padding: "7px 12px", fontSize: 13, color: "var(--rose-deep)" }}
            aria-label="この問題を削除"
          >
            削除
          </Button>
        </div>
      </div>

      <label id={fieldAnchorId(textKey)} style={labelStyle}>
        <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>問題文</span>
        <textarea
          value={q.text}
          onChange={(e) => patchQuestion(qi, { text: e.target.value })}
          placeholder="次のうち、ティラミスはどれ？"
          rows={2}
          aria-invalid={Boolean(textError) || undefined}
          aria-describedby={textError ? fieldErrorId(textKey) : undefined}
          style={{
            ...inputStyle,
            ...invalidInputStyle(Boolean(textError)),
            resize: "vertical",
            lineHeight: 1.5,
          }}
          maxLength={200}
        />
        <InlineFieldError id={fieldErrorId(textKey)} message={textError} />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>画像（任意）</span>
        {questionImage ? (
          <div style={{ position: "relative", ...QUESTION_IMAGE_BOX, alignSelf: "center" }}>
            <Image src={questionImage} alt="" fill sizes="420px" unoptimized style={{ objectFit: "contain", borderRadius: 18, display: "block", border: "1px solid var(--line)" }} />
            <button
              type="button"
              onClick={() => {
                revokePreview(q.media_preview_url);
                patchQuestion(qi, {
                  media_url: null,
                  media_changed: true,
                  media_file: null,
                  media_preview_url: null,
                });
              }}
              aria-label="画像を削除"
              style={imageRemoveButtonStyle}
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <label style={{ ...questionImageUploadLabelStyle, alignSelf: "center" }}>
            <ImagePlus size={30} strokeWidth={1.8} />
            画像を追加
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  stageImage(f, (file, previewUrl) => {
                    revokePreview(q.media_preview_url);
                    patchQuestion(qi, {
                      media_url: null,
                      media_changed: true,
                      media_file: file,
                      media_preview_url: previewUrl,
                    });
                  });
                }
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <span id={fieldAnchorId(choicesKey)} />
        <span id={fieldAnchorId(correctKey)} />
        <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>答え（チェックで正解を指定）</span>
        <InlineFieldError id={fieldErrorId(choicesKey)} message={choicesError} />
        <InlineFieldError id={fieldErrorId(correctKey)} message={correctError} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {q.choices.map((c, ci) => {
            const theme = CHOICE_THEME[ci % CHOICE_THEME.length];
            const isCorrect = q.correct_key === c.key;
            const choiceImage = c.image_preview_url ?? c.image_url;
            const choiceVisual = { ...theme, label: c.label || `答え ${ci + 1}`, image_url: choiceImage };
            const labelKey = fieldKey.choiceLabel(qi, ci);
            const labelError = fieldErrors[labelKey];
            const correctButton = (
              <AnswerChoiceCheckButton
                choice={choiceVisual}
                checked={isCorrect}
                onClick={() => setCorrect(qi, c.key)}
                ariaLabel={`答え${ci + 1}を正解にする`}
              />
            );
            const imagePicker = (
              <AnswerChoiceImagePicker
                choice={choiceVisual}
                onSelect={(file) => {
                  stageImage(file, (stagedFile, previewUrl) => {
                    revokePreview(c.image_preview_url);
                    patchChoice(qi, ci, {
                      image_url: null,
                      image_changed: true,
                      image_file: stagedFile,
                      image_preview_url: previewUrl,
                    });
                  });
                }}
              />
            );
            const imageActions = choiceImage ? (
              <AnswerChoiceRemoveImageButton
                onClick={() => {
                  revokePreview(c.image_preview_url);
                  patchChoice(qi, ci, {
                    image_url: null,
                    image_changed: true,
                    image_file: null,
                    image_preview_url: null,
                  });
                }}
              />
            ) : null;
            return (
              <div key={ci} id={fieldAnchorId(labelKey)} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <AnswerChoiceCard
                  choice={choiceVisual}
                  selected={isCorrect}
                  // Editor: every choice stays fully legible/editable. The correct one
                  // is shown by `selected` (accent outline + check) only — no dimming
                  // of the others (that washes out text you still need to read/edit).
                  compact
                  minHeight={206}
                  topRight={correctButton}
                  media={imagePicker}
                  footer={imageActions}
                >
                  <AnswerChoiceText
                    choice={choiceVisual}
                    value={c.label}
                    onChange={(value) => patchChoiceLabel(qi, ci, value)}
                    placeholder={`答え ${ci + 1}`}
                    maxLength={80}
                    invalid={Boolean(labelError)}
                    describedBy={labelError ? fieldErrorId(labelKey) : undefined}
                  />
                </AnswerChoiceCard>
                <InlineFieldError id={fieldErrorId(labelKey)} message={labelError} />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: "clamp(18px, 4vw, 40px)", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end" }}>
        <div
          id={fieldAnchorId(timeKey)}
          style={{
            ...labelStyle,
            flex: "0 0 auto",
            alignItems: "center",
            gap: 10,
            ...(timeError
              ? {
                  borderRadius: 14,
                  padding: 8,
                  outline: "2px solid var(--rose)",
                  outlineOffset: 2,
                }
              : {}),
          }}
        >
          <TimeLimitDial
            value={q.time_limit_seconds}
            onChange={(v) => patchQuestion(qi, { time_limit_seconds: v })}
          />
          <InlineFieldError id={fieldErrorId(timeKey)} message={timeError} />
        </div>
        <div
          id={fieldAnchorId(pointsKey)}
          style={{
            ...labelStyle,
            flex: "0 0 auto",
            alignItems: "center",
            gap: 10,
            ...(pointsError
              ? {
                  borderRadius: 14,
                  padding: 8,
                  outline: "2px solid var(--rose)",
                  outlineOffset: 2,
                }
              : {}),
          }}
        >
          <PointsDial
            value={q.points_base}
            onChange={(v) => patchQuestion(qi, { points_base: v })}
          />
          <InlineFieldError id={fieldErrorId(pointsKey)} message={pointsError} />
        </div>
      </div>
    </div>
  );
}

// Shell with the brand top-left, shared by every editor state.
function renderEditorShell(children: React.ReactNode) {
  return (
    <AdminShell>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <AdminBrand />
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {children}
      </div>
    </AdminShell>
  );
}

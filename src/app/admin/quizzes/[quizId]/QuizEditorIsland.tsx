"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { CHOICE_THEME } from "@/lib/quiz";
import { uploadQuizMedia, validateImageFile } from "@/lib/admin/upload-media";
import { ImagePlus, X } from "lucide-react";
import {
  FIXED_CHOICE_COUNT,
  MAX_TIME_LIMIT,
  MIN_TIME_LIMIT,
  type DraftChoice,
  type DraftQuestion,
  type DraftQuiz,
} from "@/lib/admin/quiz-form";
import {
  draftToSaveQuestions,
  EDIT_LINK_CAVEAT,
  editLinkPath,
  emptyDraftQuestion,
  quizForEditToDraft,
  type QuizForEdit,
} from "@/lib/admin/edit-link";
import { forgetQuiz, rememberQuiz } from "@/lib/admin/recent-quizzes";
import { ConfirmDialog, ConfirmDialogLayer } from "@/components/ConfirmDialog";
import { saveQuizAction } from "@/app/actions";
import {
  AdminBrand,
  AdminShell,
  cardStyle,
  eyebrowStyle,
  ghostPill,
  inputStyle,
  labelStyle,
  plumPill,
} from "@/app/admin/admin-ui";

// CHOICE accent per index, matching the play/host palette order. Kept local so
// the editor doesn't import client visual components.
type LoadState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | { kind: "ready"; draft: DraftQuiz };

// The quiz editor island. The route checks the admin invite cookie before this
// mounts; the quizId + edit token still come from the route/searchParams and gate
// the specific quiz. Save also goes through a cookie-checked Server Action.
export function QuizEditorIsland({
  quizId,
  token,
}: {
  quizId: string;
  token: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // A missing quizId/token is decided at render time (no setState-in-effect),
  // so the effect only ever runs the async fetch when both are present.
  const hasLink = Boolean(quizId && token);
  const [state, setState] = useState<LoadState>(() =>
    hasLink ? { kind: "loading" } : { kind: "invalid" },
  );
  const [saving, startSave] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const previewUrls = useRef<Set<string>>(new Set());

  // ---- load the quiz via the token-validated RPC ---------------------------
  useEffect(() => {
    if (!hasLink) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc(
        // The generated Database type lags the migration; cast the call.
        "get_quiz_for_edit" as never,
        { p_quiz_id: quizId, p_edit_token: token } as never,
      );
      if (cancelled) return;
      if (error) {
        // The RPC raises 'invalid edit link' on a token mismatch.
        if (/invalid edit link/i.test(error.message)) {
          setState({ kind: "invalid" });
        } else {
          setState({ kind: "error", message: error.message });
        }
        return;
      }
      if (!data) {
        setState({ kind: "invalid" });
        return;
      }
      const quiz = data as QuizForEdit;
      // Remember this quiz locally (valid token confirmed) so it shows up in the
      // "編集を続ける" list and the host launcher next time.
      rememberQuiz({ quizId, token, title: quiz.title });
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
  }, [supabase, quizId, token, hasLink]);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <EditorShell>
        <div style={{ ...cardStyle, alignItems: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--ink-soft)", fontWeight: 700, margin: 0 }}>
            読み込み中…
          </p>
        </div>
      </EditorShell>
    );
  }

  if (state.kind === "invalid" || state.kind === "error") {
    return (
      <EditorShell>
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
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            {state.kind === "invalid"
              ? "編集リンクが正しくありません"
              : "読み込みに失敗しました"}
          </h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            {state.kind === "invalid"
              ? "リンクが間違っているか、期限が切れている可能性があります。共有元にもう一度リンクを確認してください。"
              : state.message}
          </p>
          <Link href="/admin" style={{ textDecoration: "none", marginTop: 6 }}>
            <Button type="button" style={{ ...plumPill, fontSize: 15 }}>
              トップへ戻る
            </Button>
          </Link>
        </div>
      </EditorShell>
    );
  }

  const draft = state.draft;

  function setDraft(updater: (d: DraftQuiz) => DraftQuiz) {
    setState((s) => (s.kind === "ready" ? { kind: "ready", draft: updater(s.draft) } : s));
  }

  // ---- quiz-level setters --------------------------------------------------
  function patchQuiz(patch: Partial<DraftQuiz>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  // ---- question-level helpers ---------------------------------------------
  function patchQuestion(qi: number, patch: Partial<DraftQuestion>) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)),
    }));
  }

  function addQuestion() {
    setDraft((d) => ({ ...d, questions: [...d.questions, emptyDraftQuestion()] }));
  }

  function removeQuestion(qi: number) {
    setDraft((d) => {
      if (d.questions.length <= 1) return d;
      const removed = d.questions[qi];
      revokePreview(removed?.media_preview_url);
      removed?.choices.forEach((c) => revokePreview(c.image_preview_url));
      return { ...d, questions: d.questions.filter((_, i) => i !== qi) };
    });
  }

  function moveQuestion(qi: number, dir: -1 | 1) {
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
    previewUrls.current.add(previewUrl);
    apply(file, previewUrl);
  }

  function revokePreview(url: string | null | undefined) {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  }

  async function uploadPendingImages(draft: DraftQuiz): Promise<DraftQuiz> {
    const questions: DraftQuestion[] = [];

    for (const q of draft.questions) {
      let media_url = q.media_url ?? null;
      if (q.media_file) {
        media_url = await uploadQuizMedia(q.media_file);
      }

      const choices: DraftChoice[] = [];
      for (const c of q.choices) {
        let image_url = c.image_url ?? null;
        if (c.image_file) {
          image_url = await uploadQuizMedia(c.image_file);
        }
        choices.push({
          ...c,
          image_url,
          image_file: null,
          image_preview_url: null,
        });
      }

      questions.push({
        ...q,
        media_url,
        media_file: null,
        media_preview_url: null,
        choices,
      });
    }

    return { ...draft, questions };
  }

  // ---- save (save_quiz RPC) ------------------------------------------------
  function onSave() {
    if (draft.title.trim().length === 0) {
      toast.error("クイズのタイトルを入力してください");
      return;
    }
    for (let i = 0; i < draft.questions.length; i++) {
      const q = draft.questions[i];
      if (q.text.trim().length === 0) {
        toast.error(`問題${i + 1}の問題文を入力してください`);
        return;
      }
      if (q.choices.length !== FIXED_CHOICE_COUNT) {
        toast.error(`問題${i + 1}の答えは4つ入力してください`);
        return;
      }
      if (q.choices.some((c) => c.label.trim().length === 0)) {
        toast.error(`問題${i + 1}の答えを4つすべて入力してください`);
        return;
      }
      if (!q.choices.some((c) => c.key === q.correct_key)) {
        toast.error(`問題${i + 1}の正解を選んでください`);
        return;
      }
    }

    startSave(async () => {
      let uploadedDraft: DraftQuiz;
      try {
        uploadedDraft = await uploadPendingImages(draft);
      } catch {
        toast.error("画像をアップロードできませんでした");
        return;
      }

      const p_questions = draftToSaveQuestions(uploadedDraft);
      const res = await saveQuizAction({
        quizId,
        token,
        title: uploadedDraft.title.trim(),
        description: uploadedDraft.description.trim() || null,
        questions: p_questions,
      });
      draft.questions.forEach((q) => {
        revokePreview(q.media_preview_url);
        q.choices.forEach((c) => revokePreview(c.image_preview_url));
      });
      setState({ kind: "ready", draft: uploadedDraft });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Keep the locally-remembered title fresh after a save.
      rememberQuiz({ quizId, token, title: uploadedDraft.title.trim() });
      toast.success("保存しました");
      router.push("/admin");
    });
  }

  // ---- delete (remove from this device) ------------------------------------
  // No anon server-side delete exists (RLS allows DELETE only for the authenticated
  // owner), so this drops the local bookmark; link-holders can still open it.
  // Confirmed via an alert dialog.
  function onRemoveFromList() {
    forgetQuiz(quizId);
    setConfirmRemove(false);
    toast.success("削除しました");
    router.push("/admin");
  }

  // ---- copy edit link ------------------------------------------------------
  async function onCopyLink() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${editLinkPath(quizId, token)}`
        : editLinkPath(quizId, token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("リンクをコピーしました");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーできませんでした");
    }
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${editLinkPath(quizId, token)}`
      : editLinkPath(quizId, token);

  return (
    <EditorShell>
      <section style={{ marginBottom: 4 }}>
        <Link
          href="/admin"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--ink-soft)",
            textDecoration: "none",
          }}
        >
          ← トップへ戻る
        </Link>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(24px, 4vw, 32px)",
            margin: "8px 0 0",
            color: "var(--ink)",
          }}
        >
          クイズを編集
        </h2>
      </section>

      {/* Shareable edit link + caveat */}
      <div
        style={{
          ...cardStyle,
          gap: 12,
          border: "1.5px solid color-mix(in oklch, var(--plum) 24%, var(--line))",
        }}
      >
        <div style={eyebrowStyle}>編集リンク</div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              ...inputStyle,
              flex: "1 1 260px",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              padding: "11px 14px",
            }}
            aria-label="編集リンク"
          />
          <Button
            type="button"
            onClick={onCopyLink}
            style={{ ...plumPill, fontSize: 14, padding: "11px 18px" }}
          >
            {copied ? "コピーしました" : "リンクをコピー"}
          </Button>
        </div>
        <CaveatNote />
      </div>

      {/* Quiz meta */}
      <div style={cardStyle}>
        <div style={eyebrowStyle}>クイズの情報</div>
        <label style={labelStyle}>
          <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>タイトル</span>
          <input
            value={draft.title}
            onChange={(e) => patchQuiz({ title: e.target.value })}
            placeholder="かわいいスイーツ早押しクイズ"
            style={inputStyle}
            maxLength={80}
          />
        </label>
        <label style={labelStyle}>
          <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>説明（任意）</span>
          <textarea
            value={draft.description}
            onChange={(e) => patchQuiz({ description: e.target.value })}
            placeholder="どんなクイズか一言で"
            rows={2}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            maxLength={280}
          />
        </label>
      </div>

      {/* Questions */}
      {draft.questions.map((q, qi) => {
        const questionImage = q.media_preview_url ?? q.media_url;
        return (
        <div key={qi} style={cardStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={eyebrowStyle}>問題 {qi + 1}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Button
                type="button"
                onClick={() => moveQuestion(qi, -1)}
                disabled={qi === 0}
                style={{ ...ghostPill, padding: "7px 12px", fontSize: 13 }}
                aria-label="上へ移動"
              >
                ↑
              </Button>
              <Button
                type="button"
                onClick={() => moveQuestion(qi, 1)}
                disabled={qi === draft.questions.length - 1}
                style={{ ...ghostPill, padding: "7px 12px", fontSize: 13 }}
                aria-label="下へ移動"
              >
                ↓
              </Button>
              <Button
                type="button"
                onClick={() => removeQuestion(qi)}
                disabled={draft.questions.length <= 1}
                style={{
                  ...ghostPill,
                  padding: "7px 12px",
                  fontSize: 13,
                  color: "var(--rose-deep)",
                }}
                aria-label="この問題を削除"
              >
                削除
              </Button>
            </div>
          </div>

          <label style={labelStyle}>
            <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>問題文</span>
            <textarea
              value={q.text}
              onChange={(e) => patchQuestion(qi, { text: e.target.value })}
              placeholder="次のうち、ティラミスはどれ？"
              rows={2}
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              maxLength={200}
            />
          </label>

          {/* Question image (optional). Selection is local; Save uploads it. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>画像（任意）</span>
            {questionImage ? (
              <div style={{ position: "relative", alignSelf: "flex-start" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={questionImage}
                  alt=""
                  style={{
                    maxHeight: 180,
                    maxWidth: "100%",
                    borderRadius: 14,
                    display: "block",
                    border: "1px solid var(--line)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    revokePreview(q.media_preview_url);
                    patchQuestion(qi, {
                      media_url: null,
                      media_file: null,
                      media_preview_url: null,
                    });
                  }}
                  aria-label="画像を削除"
                  style={{
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
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <label
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 18px",
                  borderRadius: 14,
                  border: "1.5px dashed var(--line)",
                  background: "#fbfafe",
                  color: "var(--ink-soft)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <ImagePlus size={16} />
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

          {/* Choices — edited on the real play tiles (color + shape). Tap the
              check to mark the correct answer; this is exactly how players see it. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>
              答え（チェックで正解を指定）
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {q.choices.map((c, ci) => {
                const theme = CHOICE_THEME[ci % CHOICE_THEME.length];
                const isCorrect = q.correct_key === c.key;
                const choiceImage = c.image_preview_url ?? c.image_url;
                return (
                  <div
                    key={ci}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      borderRadius: 18,
                      background: theme.color,
                      boxShadow: isCorrect
                        ? `0 0 0 3px #fff, 0 0 0 6px ${theme.deep}`
                        : "var(--shadow-card)",
                      opacity: !q.correct_key || isCorrect ? 1 : 0.72,
                      transition: "opacity .15s, box-shadow .15s",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={theme.icon}
                      alt=""
                      style={{ width: 30, height: 30, objectFit: "contain", flexShrink: 0, display: "block" }}
                    />
                    <input
                      className="puni-tile-input"
                      value={c.label}
                      onChange={(e) => patchChoiceLabel(qi, ci, e.target.value)}
                      placeholder={`答え ${ci + 1}`}
                      maxLength={80}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        color: "#fff",
                        fontFamily: "var(--font-display)",
                        fontWeight: 700,
                        fontSize: 15,
                      }}
                    />
                    {choiceImage ? (
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={choiceImage}
                          alt=""
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 9,
                            objectFit: "cover",
                            display: "block",
                            border: "2px solid rgba(255,255,255,0.7)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            revokePreview(c.image_preview_url);
                            patchChoice(qi, ci, {
                              image_url: null,
                              image_file: null,
                              image_preview_url: null,
                            });
                          }}
                          aria-label="画像を削除"
                          style={{
                            position: "absolute",
                            top: -7,
                            right: -7,
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            border: "none",
                            background: "#fff",
                            color: "var(--ink-soft)",
                            cursor: "pointer",
                            boxShadow: "var(--shadow-card)",
                            fontSize: 11,
                            lineHeight: 1,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label
                        aria-label="答えに画像を追加"
                        title="画像を追加"
                        style={{
                          flexShrink: 0,
                          width: 30,
                          height: 30,
                          borderRadius: 9,
                          display: "grid",
                          placeItems: "center",
                          background: "rgba(255,255,255,0.22)",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        <ImagePlus size={16} />
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              stageImage(f, (file, previewUrl) => {
                                revokePreview(c.image_preview_url);
                                patchChoice(qi, ci, {
                                  image_url: null,
                                  image_file: file,
                                  image_preview_url: previewUrl,
                                });
                              });
                            }
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => setCorrect(qi, c.key)}
                      aria-pressed={isCorrect}
                      aria-label={`答え${ci + 1}を正解にする`}
                      style={{
                        width: 26,
                        height: 26,
                        flexShrink: 0,
                        borderRadius: 999,
                        border: "2px solid #fff",
                        background: isCorrect ? "#fff" : "transparent",
                        color: theme.deep,
                        cursor: "pointer",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 800,
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                    >
                      {isCorrect ? "✓" : ""}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-question settings */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ ...labelStyle, flex: "1 1 140px" }}>
              <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>制限時間（秒）</span>
              <input
                type="number"
                value={q.time_limit_seconds}
                onChange={(e) =>
                  patchQuestion(qi, {
                    time_limit_seconds: Number(e.target.value),
                  })
                }
                min={MIN_TIME_LIMIT}
                max={MAX_TIME_LIMIT}
                style={inputStyle}
              />
            </label>
          </div>
        </div>
        );
      })}

      <Button
        type="button"
        onClick={addQuestion}
        style={{
          ...ghostPill,
          alignSelf: "flex-start",
          fontSize: 14,
          padding: "12px 20px",
        }}
      >
        ＋ 問題を追加
      </Button>

      {/* Footer actions */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: 6,
        }}
      >
        <Button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{ ...plumPill, fontSize: 16, padding: "14px 28px" }}
        >
          {saving ? "保存中…" : "保存して戻る"}
        </Button>
        <Button
          type="button"
          onClick={() => setConfirmRemove(true)}
          style={{
            ...ghostPill,
            marginLeft: "auto",
            fontSize: 14,
            padding: "12px 18px",
            color: "var(--rose-deep)",
            border: "1.5px solid color-mix(in oklch, var(--rose) 35%, var(--line))",
          }}
        >
          クイズを削除
        </Button>
      </div>

      <ConfirmDialogLayer open={confirmRemove}>
        <ConfirmDialog
          title="このクイズを削除しますか？"
          description="この端末から削除します。共有した編集リンクを持つ人はまだ開けます。"
          confirmLabel="削除"
          cancelLabel="キャンセル"
          confirmTone="rose"
          pending={false}
          onConfirm={onRemoveFromList}
          onCancel={() => setConfirmRemove(false)}
        />
      </ConfirmDialogLayer>
    </EditorShell>
  );
}

// The "anyone with the link" caveat note, styled as a soft amber warning. Shown
// on every edit surface per the capability-link model.
export function CaveatNote() {
  return (
    <div
      style={{
        background: "color-mix(in oklch, var(--amber) 14%, #fff)",
        color: "var(--amber-deep)",
        borderRadius: 14,
        padding: "11px 15px",
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.6,
      }}
    >
      {EDIT_LINK_CAVEAT}
    </div>
  );
}

// Shell with the brand top-left, shared by every editor state.
function EditorShell({ children }: { children: React.ReactNode }) {
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

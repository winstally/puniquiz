"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { startGameForQuizAction } from "@/app/actions";
import {
  CHOICE_KEYS,
  MAX_CHOICES,
  MAX_POINTS,
  MAX_TIME_LIMIT,
  MIN_CHOICES,
  MIN_POINTS,
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
import { rememberQuiz } from "@/lib/admin/recent-quizzes";
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
const CHOICE_ACCENT = [
  "var(--rose)",
  "var(--sky)",
  "var(--amber)",
  "var(--sage)",
  "var(--plum)",
  "var(--rose-deep)",
] as const;

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | { kind: "ready"; draft: DraftQuiz };

// The login-free quiz editor. quizId + token come from the route/searchParams.
// On mount it calls get_quiz_for_edit(quizId, token); a bad/missing token shows a
// clear "編集リンクが正しくありません" screen. Otherwise it renders the editable
// form, the shareable edit link (with a copy button + the "anyone with the link"
// caveat), a 保存 button (save_quiz RPC), and a host-start button.
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
  const [hosting, startHost] = useTransition();
  const [copied, setCopied] = useState(false);

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
      setState({ kind: "ready", draft: quizForEditToDraft(quiz) });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, quizId, token, hasLink]);

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

  function addChoice(qi: number) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => {
        if (i !== qi || q.choices.length >= MAX_CHOICES) return q;
        const next: DraftChoice = {
          key: CHOICE_KEYS[q.choices.length],
          label: "",
        };
        return { ...q, choices: [...q.choices, next] };
      }),
    }));
  }

  function removeChoice(qi: number, ci: number) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => {
        if (i !== qi || q.choices.length <= MIN_CHOICES) return q;
        const oldCorrectIndex = q.choices.findIndex((c) => c.key === q.correct_key);
        const choices = q.choices
          .filter((_, j) => j !== ci)
          .map((c, j) => ({ ...c, key: CHOICE_KEYS[j] }));
        let correct_key = "";
        if (oldCorrectIndex >= 0 && oldCorrectIndex !== ci) {
          const newIndex =
            oldCorrectIndex > ci ? oldCorrectIndex - 1 : oldCorrectIndex;
          correct_key = choices[newIndex]?.key ?? "";
        }
        return { ...q, choices, correct_key };
      }),
    }));
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
      if (q.choices.some((c) => c.label.trim().length === 0)) {
        toast.error(`問題${i + 1}の選択肢をすべて入力してください`);
        return;
      }
      if (!q.choices.some((c) => c.key === q.correct_key)) {
        toast.error(`問題${i + 1}の正解を選んでください`);
        return;
      }
    }

    const p_questions = draftToSaveQuestions(draft);
    startSave(async () => {
      const { error } = await supabase.rpc(
        "save_quiz" as never,
        {
          p_quiz_id: quizId,
          p_edit_token: token,
          p_title: draft.title.trim(),
          p_description: draft.description.trim() || null,
          p_is_published: draft.is_published,
          p_questions,
        } as never,
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      // Keep the locally-remembered title fresh after a save.
      rememberQuiz({ quizId, token, title: draft.title.trim() });
      toast.success("保存しました");
    });
  }

  // ---- host-start ----------------------------------------------------------
  function onHost() {
    startHost(async () => {
      const res = await startGameForQuizAction(quizId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(res.redirect);
    });
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
        <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6 }}>
          このリンクを共有すると、誰でもこのクイズを編集できます。あとで編集するためにブックマークしておきましょう。
        </p>
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
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={draft.is_published}
            onChange={(e) => patchQuiz({ is_published: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: "var(--plum)" }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
            公開する（他の人も遊べる状態にする）
          </span>
        </label>
      </div>

      {/* Questions */}
      {draft.questions.map((q, qi) => (
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
            <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>見出し（任意）</span>
            <input
              value={q.eyebrow}
              onChange={(e) => patchQuestion(qi, { eyebrow: e.target.value })}
              placeholder={`Q${qi + 1} / ${draft.questions.length}`}
              style={inputStyle}
              maxLength={40}
            />
          </label>

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

          {/* Choices */}
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>
              選択肢（正解を選んでください）
            </span>
            {q.choices.map((c, ci) => {
              const accent = CHOICE_ACCENT[ci % CHOICE_ACCENT.length];
              const isCorrect = q.correct_key === c.key;
              return (
                <div
                  key={ci}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <button
                    type="button"
                    onClick={() => setCorrect(qi, c.key)}
                    aria-pressed={isCorrect}
                    aria-label={`選択肢${ci + 1}を正解にする`}
                    style={{
                      width: 30,
                      height: 30,
                      flexShrink: 0,
                      borderRadius: 999,
                      border: isCorrect
                        ? `2px solid ${accent}`
                        : "2px solid var(--line)",
                      background: isCorrect ? accent : "#fff",
                      color: isCorrect ? "#fff" : "var(--ink-soft)",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                      transition: "all .15s",
                    }}
                  >
                    {isCorrect ? "✓" : CHOICE_KEYS[ci].toUpperCase()}
                  </button>
                  <input
                    value={c.label}
                    onChange={(e) => patchChoiceLabel(qi, ci, e.target.value)}
                    placeholder={`選択肢 ${ci + 1}`}
                    style={{
                      ...inputStyle,
                      padding: "10px 14px",
                      borderColor: isCorrect
                        ? `color-mix(in oklch, ${accent} 50%, var(--line))`
                        : "var(--line)",
                    }}
                    maxLength={80}
                  />
                  <Button
                    type="button"
                    onClick={() => removeChoice(qi, ci)}
                    disabled={q.choices.length <= MIN_CHOICES}
                    style={{
                      ...ghostPill,
                      padding: "8px 11px",
                      fontSize: 13,
                      boxShadow: "none",
                      color: "var(--ink-soft)",
                    }}
                    aria-label="この選択肢を削除"
                  >
                    ×
                  </Button>
                </div>
              );
            })}
            {q.choices.length < MAX_CHOICES ? (
              <Button
                type="button"
                onClick={() => addChoice(qi)}
                style={{
                  ...ghostPill,
                  alignSelf: "flex-start",
                  padding: "9px 16px",
                  fontSize: 13,
                  boxShadow: "none",
                }}
              >
                ＋ 選択肢を追加
              </Button>
            ) : null}
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
            <label style={{ ...labelStyle, flex: "1 1 140px" }}>
              <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>基本点</span>
              <input
                type="number"
                value={q.points_base}
                onChange={(e) =>
                  patchQuestion(qi, { points_base: Number(e.target.value) })
                }
                min={MIN_POINTS}
                max={MAX_POINTS}
                step={100}
                style={inputStyle}
              />
            </label>
          </div>
        </div>
      ))}

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
          {saving ? "保存中…" : "保存"}
        </Button>
        <Button
          type="button"
          onClick={onHost}
          disabled={hosting}
          style={{
            ...ghostPill,
            fontSize: 15,
            padding: "13px 22px",
            border: "1.5px solid color-mix(in oklch, var(--plum) 40%, var(--line))",
            color: "var(--plum-deep)",
          }}
        >
          {hosting ? "開始中…" : "このクイズでゲーム開始"}
        </Button>
      </div>

      <p style={{ color: "var(--ink-soft)", fontSize: 12, margin: "2px 0 0", lineHeight: 1.6 }}>
        ※「ゲーム開始」は今の保存済み内容で始まります。変更したら先に保存してください。
      </p>
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

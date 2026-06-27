"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  type CreateQuizRow,
  EDIT_LINK_CAVEAT,
  editLinkPath,
  parseEditLink,
} from "@/lib/admin/edit-link";
import {
  forgetQuiz,
  rememberQuiz,
  useRecentQuizzes,
} from "@/lib/admin/recent-quizzes";
import { startGameForQuizAction } from "@/app/actions";
import {
  cardStyle,
  eyebrowStyle,
  ghostPill,
  inputStyle,
  labelStyle,
  plumPill,
} from "./admin-ui";

// AdminIntro — the login-free /admin landing island.
//
// Two paths:
//   1) "新しいクイズを作る" → create_quiz RPC → push to the new edit-link.
//   2) Paste an existing edit-link/URL to reopen a quiz you already made.
//
// No session/login: create_quiz is granted to anon and returns the new quiz's id
// + secret edit_token. The caveat is shown prominently — anyone with the link can
// edit, so no secrets should be entered.
export function AdminIntro() {
  const router = useRouter();
  const recents = useRecentQuizzes();
  const [creating, startCreate] = useTransition();
  const [hosting, startHost] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [link, setLink] = useState("");

  // Start a live game from a quiz id (host path). create_game allows hosting any
  // published/owned quiz; link-quizzes are created published, so this works.
  function host(quizId: string) {
    if (hosting) return;
    setPendingId(quizId);
    startHost(async () => {
      const res = await startGameForQuizAction(quizId);
      setPendingId(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(res.redirect);
    });
  }

  function onCreate() {
    startCreate(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        // The generated Database type lags the migration; cast the call.
        "create_quiz" as never,
        { p_title: "新しいクイズ", p_description: null } as never,
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      // create_quiz RETURNS TABLE(quiz_id, edit_token) — a single-row array.
      const rows = (data ?? []) as CreateQuizRow[];
      const row = Array.isArray(rows) ? rows[0] : (data as CreateQuizRow);
      if (!row?.quiz_id || !row?.edit_token) {
        toast.error("クイズを作成できませんでした");
        return;
      }
      // Remember it locally so it appears in "編集を続ける" / the host launcher.
      rememberQuiz({
        quizId: row.quiz_id,
        token: row.edit_token,
        title: "新しいクイズ",
      });
      router.push(editLinkPath(row.quiz_id, row.edit_token));
    });
  }

  function onOpenLink(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseEditLink(link);
    if (!parsed) {
      toast.error("編集リンクの形式が正しくありません");
      return;
    }
    router.push(editLinkPath(parsed.quizId, parsed.token));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Caveat — shown prominently on the intro too */}
      <div
        style={{
          background: "color-mix(in oklch, var(--amber) 14%, #fff)",
          color: "var(--amber-deep)",
          borderRadius: 16,
          padding: "13px 17px",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.6,
        }}
      >
        {EDIT_LINK_CAVEAT}
      </div>

      {/* Create */}
      <div style={cardStyle}>
        <div style={eyebrowStyle}>新しく作る</div>
        <div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              margin: "0 0 6px",
              color: "var(--ink)",
            }}
          >
            クイズをつくる
          </h3>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            ボタンを押すと編集ページが開きます。ログインは不要です。発行された
            <strong>編集リンク</strong>をブックマークしておけば、あとからまた編集できます。
          </p>
        </div>
        <Button
          type="button"
          disabled={creating}
          onClick={onCreate}
          style={{ ...plumPill, fontSize: 16, padding: "15px 24px", alignSelf: "flex-start" }}
        >
          {creating ? "作成中…" : "＋ 新しいクイズを作る"}
        </Button>
      </div>

      {/* Your quizzes — remembered on this device; edit or start a game */}
      {recents.length > 0 ? (
        <div style={cardStyle}>
          <div style={eyebrowStyle}>あなたのクイズ</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recents.map((q) => (
              <div
                key={q.quizId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1.5px solid var(--line)",
                  background: "#fbfafe",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {q.title}
                </span>
                <Link
                  href={editLinkPath(q.quizId, q.token)}
                  style={{
                    ...ghostPill,
                    fontSize: 13,
                    padding: "8px 14px",
                    boxShadow: "none",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  編集
                </Link>
                <Button
                  type="button"
                  onClick={() => host(q.quizId)}
                  disabled={hosting}
                  style={{ ...plumPill, fontSize: 13, padding: "9px 16px", boxShadow: "0 4px 0 var(--plum-deep)" }}
                >
                  {hosting && pendingId === q.quizId ? "開始中…" : "ゲーム開始"}
                </Button>
                <button
                  type="button"
                  onClick={() => forgetQuiz(q.quizId)}
                  aria-label="一覧から削除"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--ink-soft)",
                    fontSize: 18,
                    lineHeight: 1,
                    padding: "2px 4px",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 12, lineHeight: 1.6 }}>
            ※ この一覧はこの端末にのみ保存されます。別の端末で編集するには編集リンクを使ってください。
          </p>
        </div>
      ) : null}

      {/* Reopen existing */}
      <form style={cardStyle} onSubmit={onOpenLink}>
        <div style={eyebrowStyle}>編集を続ける</div>
        <div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              margin: "0 0 6px",
              color: "var(--ink)",
            }}
          >
            編集リンクから開く
          </h3>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            以前にコピーした編集リンク（URL）を貼り付けて、続きから編集できます。
          </p>
        </div>
        <label style={labelStyle}>
          <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>編集リンク</span>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…/admin/quizzes/…?t=…"
            autoComplete="off"
            style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 14 }}
          />
        </label>
        <Button
          type="submit"
          style={{ ...ghostPill, fontSize: 15, padding: "12px 20px", alignSelf: "flex-start" }}
        >
          開く
        </Button>
      </form>
    </div>
  );
}

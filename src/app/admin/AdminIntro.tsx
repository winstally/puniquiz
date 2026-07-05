"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Pencil, Play, Plus } from "lucide-react";
import { PuniButton, PuniIcon } from "@/components/PuniButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { puniButtonStyle } from "@/lib/puni-button";
import { editLinkPath } from "@/lib/admin/quiz-authoring";
import { useRecentQuizzes } from "@/lib/admin/recent-quizzes";
import { createQuizAction, startDemoGameAction, startGameForQuizAction } from "@/app/actions";
import { cardStyle } from "./admin-styles";

const recentQuizTitleStyle = {
  flex: 1,
  minWidth: 0,
  fontWeight: 700,
  fontSize: 15,
  color: "var(--ink)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

// AdminIntro — the invite-gated /admin landing island.
//
// Two paths:
//   1) "新しいクイズを作る" → create_quiz RPC → push to the editor.
//   2) Reopen a locally remembered quiz, then edit or host it.
//
// The page route checks the invite cookie before rendering this island. Mutating
// actions also re-check that cookie server-side.
export function AdminIntro({ autoStartDemo = false }: { autoStartDemo?: boolean }) {
  const router = useRouter();
  const recents = useRecentQuizzes();
  const [creating, startCreate] = useTransition();
  const [hosting, startHost] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Quiz awaiting the start confirmation.
  const [startChoiceId, setStartChoiceId] = useState<string | null>(null);

  // Landing "デモを試す" routes here as /admin?demo=1 so it passes the invite gate
  // like every other host path; once allowed in, auto-start the curated demo.
  const demoStartedRef = useRef(false);
  useEffect(() => {
    if (demoStartedRef.current) return;
    if (!autoStartDemo) return;
    demoStartedRef.current = true;
    startHost(async () => {
      const res = await startDemoGameAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(res.redirect);
    });
  }, [autoStartDemo, router, startHost]);

  // Tapping ゲーム開始 asks for confirmation first (a stray tap shouldn't kick off
  // a game). Whether to warm up with the demo is decided later, ON the lobby
  // screen after players gather — see HostController's start dialog.
  function host(quizId: string) {
    if (hosting) return;
    setStartChoiceId(quizId);
  }

  // Confirmed → create the game and go to its lobby.
  function launch(quizId: string) {
    if (hosting) return;
    setStartChoiceId(null);
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
      const res = await createQuizAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(res.redirect);
    });
  }

  // Section header inside the card — darker than the faint field-label eyebrow so
  // "あなたのクイズ" reads clearly.
  const sectionLabel: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
    color: "var(--ink)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Create — the primary action. A page-level CTA standing outside the card;
          the button is its own label. */}
      <PuniButton
        type="button"
        variant="plum"
        size="lg"
        wide
        icon={Plus}
        disabled={creating}
        onClick={onCreate}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {creating ? "作成中…" : "新しいクイズを作る"}
      </PuniButton>

      {/* Your quizzes — those saved on this device (edit or start). Only shown when
          there are any. Reopening a quiz made elsewhere is just opening its edit
          link, so there's no paste-a-link field here. */}
      {recents.length > 0 ? (
        <div style={{ ...cardStyle, gap: 18, padding: "28px clamp(22px, 4vw, 32px)" }}>
          <div style={sectionLabel}>あなたのクイズ</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {recents.map((q, i) => (
              <div
                key={q.quizId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <span style={{ ...recentQuizTitleStyle, color: q.title.trim() ? "var(--ink)" : "var(--ink-soft)" }}>
                  {q.title.trim() || "無題のクイズ"}
                </span>
                <Link
                  href={editLinkPath(q.quizId)}
                  style={{
                    ...puniButtonStyle({ variant: "ghost", size: "sm", wide: true }),
                    textDecoration: "none",
                    boxShadow: "none",
                  }}
                >
                  <PuniIcon icon={Pencil} size="sm" />
                  編集
                </Link>
                <PuniButton
                  type="button"
                  variant="plum"
                  size="sm"
                  wide
                  icon={Play}
                  iconFilled
                  disabled={hosting}
                  onClick={() => host(q.quizId)}
                >
                  {hosting && pendingId === q.quizId ? "開始中…" : "ゲーム開始"}
                </PuniButton>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13 }}>
            管理招待を通したブラウザだけが編集できます。
          </p>
        </div>
      ) : null}

      <AnimatePresence>
        {startChoiceId ? (
          <ConfirmDialog
            title="ゲームを開始しますか？"
            description="参加者を集めるロビーに移動します。"
            confirmLabel="開始する"
            cancelLabel="キャンセル"
            pending={hosting}
            onCancel={() => setStartChoiceId(null)}
            onConfirm={() => launch(startChoiceId)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

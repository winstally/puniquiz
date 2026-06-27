"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pageShell, CONTENT_NARROW } from "@/lib/layout";
import { joinGameAction, lookupGameAction } from "@/app/actions";

// --- shared tokens ----------------------------------------------------------
// ONE primary identity (filled plum pill + 3D shadow) for every main CTA.
const plumPill: React.CSSProperties = {
  color: "#fff",
  border: "none",
  height: "auto",
  cursor: "pointer",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 16,
  padding: "15px 24px",
  borderRadius: 999,
  background:
    "radial-gradient(120% 80% at 30% 18%, rgba(255,255,255,0.45), rgba(255,255,255,0) 55%), linear-gradient(158deg, var(--plum), var(--plum-deep))",
  boxShadow: "0 6px 0 var(--plum-deep), 0 12px 20px -8px var(--plum)",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 28,
  padding: "30px clamp(20px, 5vw, 34px)",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 2,
  color: "var(--ink-soft)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--line)",
  borderRadius: 16,
  padding: "13px 16px",
  fontSize: 16,
  fontFamily: "var(--font-body)",
  color: "var(--ink)",
  background: "#fbfafe",
  outline: "none",
};

// ===========================================================================
// Landing — the puni wordmark is the hero; participation sits right below it.
// A single quiet CTA top-right ("クイズの管理はこちら →") leads to the hub.
// ===========================================================================
function Landing() {
  const searchParams = useSearchParams();
  // ?join={pin} (opened from a scanned join link) prefills the code field.
  const joinPrefill = (searchParams.get("join") ?? "").replace(/\D/g, "").slice(0, 6);

  return (
    <main style={pageShell}>
      <header style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Link href="/admin" style={{ textDecoration: "none" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 13,
              color: "var(--plum-deep)",
              background: "#fff",
              border: "1.5px solid color-mix(in oklch, var(--plum) 30%, var(--line))",
              padding: "9px 16px",
              borderRadius: 999,
              boxShadow: "var(--shadow-card)",
              whiteSpace: "nowrap",
            }}
          >
            クイズの管理はこちら →
          </span>
        </Link>
      </header>

      <div style={{ maxWidth: CONTENT_NARROW, margin: "0 auto" }}>
        {/* Hero logo */}
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 380,
            aspectRatio: "1000 / 360",
            margin: "6px auto 22px",
          }}
        >
          <Image
            src="/logo.png"
            alt="ぷにぷにQuiz"
            fill
            priority
            sizes="380px"
            style={{ objectFit: "contain" }}
          />
        </div>

        <JoinCard joinPrefill={joinPrefill} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// JoinCard — the hero action. Two steps in one card: (1) enter + validate a
// code, (2) enter a nickname and join.
// ---------------------------------------------------------------------------
function JoinCard({ joinPrefill }: { joinPrefill: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"enter" | "nickname">("enter");
  const [codeInput, setCodeInput] = useState(joinPrefill);
  const [confirmedPin, setConfirmedPin] = useState("");
  const [quizTitle, setQuizTitle] = useState("");
  const [nickname, setNickname] = useState("");
  const [validating, startValidate] = useTransition();
  const [joining, startJoin] = useTransition();

  function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (validating) return;
    const clean = codeInput.replace(/\D/g, "");
    if (clean.length === 0) {
      toast.error("参加コードを入力してください");
      return;
    }
    startValidate(async () => {
      const res = await lookupGameAction(clean);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirmedPin(clean);
      setQuizTitle(res.quizTitle);
      setNickname("");
      setStep("nickname");
    });
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (joining) return;
    const nick = nickname.trim();
    if (nick.length === 0) {
      toast.error("ニックネームを入力してください");
      return;
    }
    startJoin(async () => {
      const res = await joinGameAction(confirmedPin, nick);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(res.redirect);
    });
  }

  if (step === "nickname") {
    return (
      <form style={cardStyle} onSubmit={onJoin}>
        <span
          style={{
            display: "inline-flex",
            alignSelf: "flex-start",
            alignItems: "center",
            gap: 8,
            background: "color-mix(in oklch, var(--plum) 10%, #fff)",
            color: "var(--plum-deep)",
            fontWeight: 700,
            fontSize: 13,
            padding: "7px 14px",
            borderRadius: 999,
          }}
        >
          <CheckBadge />「{quizTitle}」に参加
        </span>

        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span style={{ ...eyebrowStyle, letterSpacing: 1.5 }}>ニックネーム</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            autoComplete="off"
            autoFocus
            placeholder="ぷに"
            style={{ ...inputStyle, fontSize: 18 }}
          />
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            onClick={() => setStep("enter")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ink-soft)",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 13,
              padding: 0,
              whiteSpace: "nowrap",
            }}
          >
            ← 戻る
          </button>
          <Button type="submit" disabled={joining} style={{ ...plumPill, flex: 1 }}>
            {joining ? "参加中…" : "参加する"}
          </Button>
        </div>
      </form>
    );
  }

  // step === "enter"
  return (
    <form style={cardStyle} onSubmit={onSubmitCode}>
      <label style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ ...eyebrowStyle, letterSpacing: 1.5, textAlign: "center" }}>参加コード</span>
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="000000"
          aria-label="参加コード"
          style={{
            ...inputStyle,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: "clamp(34px, 8vw, 46px)",
            letterSpacing: 10,
            textAlign: "center",
            padding: "16px 8px",
            color: "var(--plum-deep)",
          }}
        />
      </label>

      <Button type="submit" disabled={validating} style={plumPill}>
        {validating ? "確認中…" : "次へ"}
      </Button>
    </form>
  );
}

function CheckBadge() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
}

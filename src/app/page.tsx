"use client";

import { Suspense, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { PuniButton } from "@/components/PuniButton";
import { Brand } from "@/components/Brand";
import { pageShell } from "@/lib/layout";
import { formatPin } from "@/lib/pin";
import { LandingStory } from "@/components/LandingStory";
import { HeroCandyPhysics } from "@/components/HeroCandyPhysics";
import { joinGameAction, lookupGameAction } from "@/app/actions";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 28,
  padding: "26px clamp(20px, 4vw, 30px)",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
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
// Landing — a full marketing LP in the puni world: nav, a two-column hero (copy
// + the glossy ぷに icon, floating candy shapes), then <LandingStory/> (features,
// demo, steps, FAQ, CTA, footer). Web app → no app-store badges; the hero action
// is the real join card.
// ===========================================================================
// Demo entry: hosting is invite-gated, so the demo goes through /admin too (it
// never bypasses the gate). The ?demo flag tells the invited admin page to start
// the curated demo automatically.
function DemoButton() {
  const router = useRouter();
  return (
    <PuniButton
      variant="plum"
      size="sm"
      onClick={() => router.push("/admin?demo=1")}
      // Match the ghost "クイズを管理" box exactly so the pair lines up: a transparent
      // 1.5px border equalizes the height (ghost has a real border), and a flat
      // shadow-card replaces plum's default "0 6px 0" 3D base (which made this button
      // sit lower/taller than the flat ghost).
      style={{ whiteSpace: "nowrap", border: "1.5px solid transparent", boxShadow: "var(--shadow-card)" }}
    >
      デモを試す
    </PuniButton>
  );
}

function Landing() {
  const searchParams = useSearchParams();
  // ?join={pin} (opened from a scanned join link) prefills the code field.
  const joinPrefill = (searchParams.get("join") ?? "").replace(/\D/g, "").slice(0, 6);

  return (
    <main style={{ ...pageShell, paddingTop: 14 }}>
      <NavBar />

      {/* Hero — full-bleed lavender band, join (left) + wordmark/copy (right),
          floating candy, and a soft wave divider into the content below */}
      <section className="hero">
        <HeroCandyPhysics />
        <div className="hero-inner">
          <div className="hero-grid">
            <div className="hero-brand">
              <p className="hero-eyebrow">
                みんなで楽しめるクイズアプリ。
                <br />
                すぐに遊べて、盛り上がる！
              </p>
              <Image
                src="/logo-hero.webp"
                alt="ぷにぷにQuiz"
                width={1918}
                height={361}
                priority
                className="hero-logo"
              />
            </div>

            <div className="hero-join">
              <div id="join" style={{ scrollMarginTop: 90, width: "100%", maxWidth: 460 }}>
                <JoinCard key={joinPrefill} joinPrefill={joinPrefill} />
              </div>
            </div>
          </div>
        </div>
        <div className="hero-wave" aria-hidden>
          <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
            <path d="M0,44 C300,88 560,6 880,34 C1130,57 1310,52 1440,40 L1440,82 L0,82 Z" />
          </svg>
        </div>
      </section>

      <LandingStory />

      <style>{`
        html { scroll-behavior: smooth; }
        body { overflow-x: hidden; }

        /* Join code: faint placeholder, dark typed digits */
        .join-code::placeholder { color: color-mix(in oklch, var(--plum) 26%, #d7d1ea); opacity: 1; }

        .nav {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 6px 0 2px; margin-bottom: 8px;
        }
        .nav-links { display: flex; align-items: center; gap: 26px; }
        .nav-link {
          font-family: var(--font-display); font-weight: 700; font-size: 14px;
          color: var(--ink-soft); text-decoration: none;
        }
        .nav-link:hover { color: var(--plum-deep); }
        .nav-right {
          display: flex; align-items: center; gap: 12px; margin-left: auto;
        }
        .nav-right > * { flex-shrink: 0; }

        .hero {
          position: relative; overflow: hidden;
          width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw);
          min-height: clamp(580px, 82vh, 800px);
          display: flex; align-items: center;
          padding: clamp(72px, 9vh, 128px) 0 clamp(124px, 14vw, 196px);
          background: linear-gradient(180deg, #f6f4fb 0%, #ebe4fb 32%, #e7e0fb 100%);
        }
        .hero-inner {
          position: relative; z-index: 2; width: 100%;
          max-width: 1180px; margin: 0 auto; padding: 0 clamp(20px, 5vw, 56px);
        }
        .hero-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: clamp(32px, 6vw, 80px); align-items: center;
        }
        .hero-wave { position: absolute; left: 0; bottom: -1px; width: 100%; line-height: 0; z-index: 0; }
        .hero-wave svg { display: block; width: 100%; height: clamp(46px, 6.5vw, 82px); }
        .hero-wave path { fill: #f7f5fb; }
        .hero-join { display: flex; justify-content: center; }
        .hero-brand { display: flex; flex-direction: column; align-items: flex-start; text-align: left; }
        .hero-eyebrow {
          margin: 0 0 28px; font-family: var(--font-display); font-weight: 700;
          font-size: clamp(18px, 2.7vw, 24px); line-height: 1.6; letter-spacing: -0.01em; color: var(--ink);
        }
        .hero-logo { width: clamp(260px, 44vw, 520px); height: auto; display: block; }
        .floaters-narrow { display: none; }

        @media (max-width: 860px) {
          .hero { min-height: 0; padding: clamp(32px, 7vw, 60px) 0 clamp(96px, 16vw, 148px); }
          .hero-grid { grid-template-columns: 1fr; gap: clamp(44px, 11vw, 72px); }
          .hero-brand { align-items: center; text-align: center; }
          .hero-eyebrow { font-size: clamp(16px, 4.2vw, 19px); line-height: 1.75; max-width: 19em; margin: 0 auto 34px; }
          .hero-logo { width: clamp(240px, 74vw, 400px); }
          /* swap the scattered desktop candy for the corner-only narrow set so it
             never overlaps the copy or the join card */
          .floaters-wide { display: none; }
          .floaters-narrow { display: block; }
        }
        @media (max-width: 900px) {
          .nav-links { display: none; }
        }
        @media (max-width: 520px) {
          .nav-right { gap: 8px; }
          .nav-right button {
            font-size: 12px !important;
            padding: 9px 13px !important;
          }
        }
        @media (max-width: 380px) {
          .nav-admin { display: none !important; }
        }
      `}</style>
    </main>
  );
}

// ---------------------------------------------------------------------------
// NavBar — wordmark + section anchors + manage / start CTAs.
// ---------------------------------------------------------------------------
function NavBar() {
  const router = useRouter();

  return (
    <header className="nav">
      <Brand />

      <nav className="nav-links">
        <a href="#features" className="nav-link">特徴</a>
        <a href="#how" className="nav-link">遊び方</a>
        <a href="#faq" className="nav-link">よくある質問</a>
      </nav>

      <div className="nav-right">
        <PuniButton className="nav-admin" variant="ghost" size="sm" onClick={() => router.push("/admin")}>
          クイズを管理
        </PuniButton>
        <DemoButton />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// JoinCard — the hero action. Two steps in one card: (1) enter + validate a
// code, (2) enter a nickname and join.
// ---------------------------------------------------------------------------
function JoinCard({ joinPrefill }: { joinPrefill: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"enter" | "nickname">("enter");
  const confirmedPinRef = useRef("");
  const [nickname, setNickname] = useState("");
  const [validating, startValidate] = useTransition();
  const [joining, startJoin] = useTransition();

  function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (validating) return;
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const clean = String(data.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
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
      confirmedPinRef.current = clean;
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
      const res = await joinGameAction(confirmedPinRef.current, nick);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.joinKind === "reconnected" ? "再接続しました" : "参加しました");
      router.push(res.redirect);
    });
  }

  if (step === "nickname") {
    return (
      <form style={{ ...cardStyle, width: "100%" }} onSubmit={onJoin}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 15,
            color: "var(--ink)",
            textAlign: "center",
          }}
        >
          ニックネームを入力してください！
        </p>

        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 20))}
          autoComplete="off"
          placeholder="ぷに"
          aria-label="ニックネーム"
          style={{ ...inputStyle, fontSize: 18, textAlign: "center" }}
        />

        <PuniButton type="submit" variant="plum" size="lg" wide disabled={joining}>
          {joining ? "参加中…" : "参加する"}
        </PuniButton>
      </form>
    );
  }

  // step === "enter"
  return (
    <form style={{ ...cardStyle, width: "100%" }} onSubmit={onSubmitCode}>
      <label style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--ink)", textAlign: "center" }}>
          コードでクイズに参加！
        </span>
        <input
          name="code"
          className="join-code"
          defaultValue={formatPin(joinPrefill)}
          onChange={(e) => {
            e.currentTarget.value = formatPin(e.currentTarget.value.replace(/\D/g, "").slice(0, 6));
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0000 00"
          aria-label="参加コード"
          style={{
            ...inputStyle,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: "clamp(32px, 7vw, 44px)",
            letterSpacing: 10,
            textAlign: "center",
            padding: "16px 8px",
            color: "var(--plum-deep)",
          }}
        />
      </label>

      <PuniButton type="submit" variant="plum" size="lg" wide disabled={validating}>
        {validating ? "確認中…" : "次へ"}
      </PuniButton>
    </form>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  );
}

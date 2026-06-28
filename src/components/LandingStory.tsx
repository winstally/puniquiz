"use client";

// LandingStory — the below-the-fold marketing LP: features, a live product demo,
// an illustrated 3-step how-to, FAQ, a candy CTA band, and the footer. Matches
// the puni reference design; web app, so no app-store anything.

import { useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useInView, useReducedMotion } from "motion/react";
import { Pencil, Users, Trophy } from "lucide-react";
import { ScrollReveal } from "@/components/ScrollReveal";
import { HostScreen, type RosterAvatar } from "@/components/HostScreen";
import { PlayerBoard } from "@/components/PlayerBoard";
import { hydrateChoices } from "@/lib/quiz";
import type { RoundPhase } from "@/lib/realtime/useGameState";
import { useDemoLoop, type DemoPhase } from "@/components/demoLoop";
import { FloatingShapes } from "@/components/PuniDecor";

// Hydration-safe "are we on the client yet" — false on the server AND the first
// client (hydration) render, true afterwards. Lets the demo render the same
// deterministic frame on both sides, then switch on reduced-motion / in-view
// without a mismatch. No setState-in-effect (same pattern as JoinQr).
const subMounted = () => () => {};
const getMounted = () => true;
const getServerMounted = () => false;

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: React.ReactNode }) {
  return (
    <ScrollReveal>
      <p className="lp-eyebrow">
        <span className="lp-dot" />
        {eyebrow}
      </p>
      <h2 className="lp-headline">{title}</h2>
    </ScrollReveal>
  );
}

// ── Features ────────────────────────────────────────────────────────────────
function Features() {
  const items = [
    { n: "01", accent: "var(--rose)", deep: "var(--rose-deep)", icon: "/answers/0.png", lead: "速いほど、", key: "高得点" },
    { n: "02", accent: "var(--sky)", deep: "var(--sky-deep)", icon: "/answers/1.png", lead: "リアルタイムで、", key: "繋がる" },
    { n: "03", accent: "var(--amber)", deep: "var(--amber-deep)", icon: "/answers/2.png", lead: "アカウント、", key: "不要" },
  ];
  return (
    <section id="features" className="lp-anchor">
      <SectionHeader eyebrow="ぷにぷにQuizは、" title="速くて、かわいくて、かんたん。" />
      <div className="feat-grid">
        {items.map((it, i) => (
          <ScrollReveal key={it.n} delay={i * 0.1} className="feat">
            <span
              className="feat-art"
              style={{ background: `radial-gradient(circle at 50% 42%, color-mix(in oklch, ${it.accent} 20%, #fff), color-mix(in oklch, ${it.accent} 6%, #fff) 70%)` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.icon} alt="" className="feat-art-img" />
              <span className="feat-num" style={{ background: it.deep }}>{it.n}</span>
            </span>
            <h3 className="feat-title">
              {it.lead}
              <span style={{ color: it.deep }}>{it.key}</span>
            </h3>
            <span className="feat-rule" style={{ background: `linear-gradient(90deg, transparent, ${it.accent}, transparent)` }} />
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

// ── Demo — the LIVE product, not a mock-up: the real <HostScreen/> and the real
// player board (<PlayerBoard/>), driven by a scripted loop through the genuine
// gameplay beat (3-2-1 → read → choices unlock → reveal → repeat). One source of
// truth — these are the exact components the game renders.
const DEMO_QUESTION = "ココアパウダーがかかっているのは？";
const DEMO_CHOICES = hydrateChoices([
  { key: "a", label: "ティラミス", image_url: "/desserts/tiramisu.jpg" },
  { key: "b", label: "プリン", image_url: "/desserts/pudding.jpg" },
  { key: "c", label: "ショートケーキ", image_url: "/desserts/shortcake.jpg" },
  { key: "d", label: "パンケーキ", image_url: "/desserts/pancake.jpg" },
]);
const DEMO_VOTES = [12, 4, 2, 2];
const DEMO_ROSTER: RosterAvatar[] = [
  { initial: "て", bg: "var(--amber)" },
  { initial: "み", bg: "var(--sky)" },
  { initial: "ぷ", bg: "var(--rose)" },
];
const DEMO_COUNT = 12;
const DEMO_CORRECT = 0; // ティラミス

// The player's phone, framed in a bezel. The reveal tint is painted on the screen
// here (the real game paints it on the phone viewport); candy rain is product-only.
function PhoneBezel({ tint, children }: { tint?: string; children: React.ReactNode }) {
  return (
    <div className="demo-phone-frame">
      <div className="demo-phone-screen" style={{ backgroundImage: tint }}>
        <div className="demo-phone-bar">
          <span className="demo-phone-dot">ぷ</span>
          ぷに
        </div>
        {children}
      </div>
    </div>
  );
}

function Demo() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(subMounted, getMounted, getServerMounted);
  const inView = useInView(sceneRef, { amount: 0.4 });
  const reduce = useReducedMotion();
  const { phase, secs } = useDemoLoop(mounted && inView && !reduce);
  // Until hydration completes, render the deterministic opening frame (countdown)
  // on both server and client; only then honor reduced-motion / the loop.
  const displayPhase: DemoPhase = !mounted ? "countdown" : reduce ? "reveal" : phase;

  // Map the loop phase onto the real component props.
  const revealed = displayPhase === "reveal";
  const answering = displayPhase === "answering";
  const roundPhase: RoundPhase = displayPhase === "reveal" ? null : displayPhase;
  const votes = answering || revealed ? DEMO_VOTES : [0, 0, 0, 0];
  const seconds = answering ? secs : 0;
  const countdownNumber = displayPhase === "countdown" ? secs : 0;
  // The demo player picked the correct answer → green reveal tint.
  const phoneTint = revealed ? "linear-gradient(180deg,#eafaf2 0%,#f7f5fb 60%)" : undefined;

  return (
    <section>
      <SectionHeader eyebrow="ライブで、" title="大画面とスマホで、早押し。" />
      <ScrollReveal delay={0.05} style={{ marginTop: 30 }}>
        <div className="demo-scene" ref={sceneRef}>
          <div className="demo-screen">
            <HostScreen
              choices={DEMO_CHOICES}
              eyebrow="Q1 / 3"
              question={DEMO_QUESTION}
              media="/demo/coffee.jpg"
              votes={votes}
              seconds={seconds}
              totalSeconds={5}
              correctId={DEMO_CORRECT}
              revealed={revealed}
              roster={DEMO_ROSTER}
              count={DEMO_COUNT}
              roundPhase={roundPhase}
              countdownNumber={countdownNumber}
            />
          </div>
          <PhoneBezel tint={phoneTint}>
            <PlayerBoard
              choices={DEMO_CHOICES}
              picked={DEMO_CORRECT}
              correctId={DEMO_CORRECT}
              revealed={revealed}
              onPick={() => {}}
              roundPhase={roundPhase}
              countdownNumber={countdownNumber}
            />
          </PhoneBezel>
        </div>
      </ScrollReveal>
    </section>
  );
}

// ── How it works — illustrated 3-step sequence ───────────────────────────────
function Steps() {
  const steps = [
    { n: "01", Icon: Pencil, title: "クイズを作る", desc: "ログイン不要。その場ですぐ作れる。" },
    { n: "02", Icon: Users, title: "コードで集める", desc: "参加コードを送るだけ。みんながスマホで参加。" },
    { n: "03", Icon: Trophy, title: "その場で早押し", desc: "大画面で出題、表彰台で盛り上がる。" },
  ];
  return (
    <section id="how" className="lp-anchor">
      <SectionHeader eyebrow="はじめかたは、" title="たったの3ステップ。" />
      <div className="steps-row">
        {steps.map((s, i) => (
          <ScrollReveal key={s.n} delay={i * 0.1} className="step">
            <span className="step-art">
              <s.Icon size={32} strokeWidth={2} aria-hidden />
              <span className="step-num">{s.n}</span>
            </span>
            <h3 className="step-title">{s.title}</h3>
            <p className="step-desc">{s.desc}</p>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
function Faq() {
  const qa = [
    { q: "永久無料ですか？", a: "はい。すべての機能をずっと無料で使えます。" },
    { q: "ログインは必要ですか？", a: "不要です。参加はコード入力だけ、作成も編集リンクだけではじめられます。" },
    { q: "何人まで参加できますか？", a: "大人数でOK。全員のスマホがリアルタイムに同期します。" },
    { q: "作ったクイズはあとから編集できますか？", a: "発行される編集リンクから、いつでも編集できます。" },
  ];
  return (
    <section id="faq" className="lp-anchor">
      <SectionHeader eyebrow="よくある質問" title="Q&A" />
      <div className="faq-list">
        {qa.map((item, i) => (
          <ScrollReveal key={item.q} delay={i * 0.06} className="faq-row">
            <p className="faq-q">
              <span className="faq-mark">Q</span>
              {item.q}
            </p>
            <p className="faq-a">{item.a}</p>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

// ── CTA band ─────────────────────────────────────────────────────────────────
function Cta() {
  return (
    <ScrollReveal>
      <section className="cta-band">
        <FloatingShapes variant="cta" />
        <div className="cta-inner">
          <h2 className="cta-title">クイズを作成してみよう！</h2>
          <Link href="/admin" className="cta-btn">
            無料で始める →
          </Link>
        </div>
      </section>
    </ScrollReveal>
  );
}

export function LandingStory() {
  return (
    <div className="lp-story">
      <Features />
      <Demo />
      <Steps />
      <Faq />
      <Cta />

      <style>{`
        .lp-story { max-width: 1120px; margin: clamp(80px, 10vw, 132px) auto 0; display: flex; flex-direction: column; gap: clamp(112px, 15vw, 220px); }
        .lp-anchor { scroll-margin-top: 84px; }

        /* Editorial section header */
        .lp-eyebrow {
          margin: 0; display: inline-flex; align-items: center; gap: 8px;
          font-family: var(--font-display); font-weight: 700; font-size: 13px; color: var(--plum-deep);
        }
        .lp-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--plum); display: inline-block; }
        .lp-headline {
          margin: 12px 0 0; font-family: var(--font-display); font-weight: 700;
          font-size: clamp(26px, 5vw, 42px); line-height: 1.12; letter-spacing: -0.02em; color: var(--ink);
        }

        /* Demo — host big screen + player phone, side by side */
        .demo-scene { display: flex; align-items: center; justify-content: center; gap: 24px; flex-wrap: wrap; }
        .demo-screen { flex: 1 1 430px; min-width: 0; }
        .demo-phone-frame {
          flex: 0 0 auto; width: 250px;
          background: linear-gradient(160deg, #2a2140, #17112a);
          border-radius: 36px; padding: 8px;
          box-shadow: 0 36px 56px -26px rgba(40,28,64,0.55), inset 0 0 0 1px rgba(255,255,255,0.06);
        }
        /* No inner padding — PlayerBoard pads its own content, and the reveal wash
           fills the screen edge-to-edge (clipped by overflow). */
        .demo-phone-screen {
          position: relative; overflow: hidden;
          background: radial-gradient(120% 60% at 50% 0%, #efeafb, #f6f3fc);
          border-radius: 29px; display: flex; flex-direction: column; min-height: 384px;
        }
        .demo-phone-bar { display: flex; align-items: center; gap: 8px; padding: 13px 14px 4px; font-family: var(--font-display); font-weight: 700; font-size: 12px; color: var(--ink-soft); }
        .demo-phone-dot {
          width: 20px; height: 20px; border-radius: 999px; display: grid; place-items: center;
          background: linear-gradient(158deg, var(--plum), var(--plum-deep)); color: #fff; font-size: 11px;
        }
        @media (max-width: 720px) { .demo-screen { flex: 1 1 100%; } }


        /* Features — flat/editorial: big jelly shape in a tinted disc with a
           number tag, accent-keyed title, hairline rule. No card box. */
        .feat-grid { margin-top: 48px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        .feat { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; }
        .feat-art {
          position: relative; width: 150px; height: 150px; border-radius: 999px; display: grid; place-items: center;
          transition: transform .18s ease;
        }
        .feat:hover .feat-art { transform: translateY(-4px); }
        .feat-art-img { width: 100px; height: 100px; object-fit: contain; display: block; filter: drop-shadow(0 10px 16px rgba(0,0,0,0.16)); }
        .feat-num {
          position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border-radius: 999px;
          display: grid; place-items: center; color: #fff;
          font-family: var(--font-mono); font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums;
          box-shadow: 0 6px 14px -6px rgba(40,28,64,0.4);
        }
        .feat-title { font-family: var(--font-display); font-weight: 700; font-size: 21px; margin: 4px 0 0; color: var(--ink); letter-spacing: -0.01em; }
        .feat-rule { width: 64px; height: 3px; border-radius: 999px; }

        /* Steps — flat/editorial: icon disc + copy on the page, no card box */
        .steps-row { margin-top: 48px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        .step { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
        .step-art {
          position: relative; width: 92px; height: 92px; border-radius: 999px; display: grid; place-items: center;
          color: var(--plum-deep);
          background: radial-gradient(circle at 50% 38%, color-mix(in oklch, var(--plum) 18%, #fff), color-mix(in oklch, var(--plum) 7%, #fff) 70%);
        }
        .step-num {
          position: absolute; top: -4px; right: -4px; width: 28px; height: 28px; border-radius: 999px;
          display: grid; place-items: center; color: #fff;
          background: linear-gradient(158deg, var(--plum), var(--plum-deep));
          font-family: var(--font-mono); font-weight: 700; font-size: 12px; font-variant-numeric: tabular-nums;
          box-shadow: 0 4px 10px -4px var(--plum);
        }
        .step-title { font-family: var(--font-display); font-weight: 700; font-size: 18px; margin: 2px 0 0; color: var(--ink); }
        .step-desc { color: var(--ink-soft); font-size: 14px; line-height: 1.7; margin: 0; max-width: 220px; }

        /* FAQ — flat list with hairline dividers (no cards) */
        .faq-list { margin-top: 40px; max-width: 640px; }
        .faq-row { padding: 20px 2px; border-top: 1px solid var(--line); }
        .faq-row:first-child { border-top: none; }
        .faq-q { margin: 0 0 7px; display: flex; align-items: center; gap: 10px; font-family: var(--font-display); font-weight: 700; font-size: 15.5px; color: var(--ink); }
        .faq-mark { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 999px; display: grid; place-items: center; background: color-mix(in oklch, var(--plum) 12%, #fff); color: var(--plum-deep); font-size: 13px; }
        .faq-a { margin: 0; padding-left: 34px; color: var(--ink-soft); font-size: 14px; line-height: 1.65; }

        /* CTA band — solid candy plum */
        .cta-band {
          position: relative; overflow: hidden; border-radius: 30px;
          padding: clamp(44px, 7vw, 72px) clamp(24px, 5vw, 48px); text-align: center;
          background:
            radial-gradient(120% 90% at 30% 10%, rgba(255,255,255,0.28), rgba(255,255,255,0) 55%),
            linear-gradient(158deg, var(--plum), var(--plum-deep));
          box-shadow: 0 30px 60px -30px var(--plum);
        }
        .cta-inner { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 22px; }
        .cta-title { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: clamp(22px, 5vw, 34px); letter-spacing: -0.01em; color: #fff; }
        .cta-btn {
          display: inline-flex; align-items: center; text-decoration: none;
          background: #fff; color: var(--plum-deep);
          font-family: var(--font-display); font-weight: 700; font-size: 17px;
          padding: 16px 38px; border-radius: 999px;
          box-shadow: 0 8px 0 rgba(40,28,64,0.18), 0 16px 26px -10px rgba(40,28,64,0.4);
          transition: transform .16s ease;
        }
        .cta-btn:hover { transform: translateY(-2px); }

        /* Hover lift */
        .lift { transition: transform .18s ease, box-shadow .18s ease; }
        .lift:hover { transform: translateY(-4px); box-shadow: 0 24px 42px -20px color-mix(in oklch, var(--plum) 48%, transparent); }

        @media (max-width: 720px) {
          .feat-grid, .steps-row { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lift, .cta-btn { transition: none; }
          .lift:hover, .cta-btn:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}

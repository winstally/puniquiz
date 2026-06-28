"use client";

// PlayerBoard — the SINGLE source of truth for the player's in-question screen:
// the 3-2-1 countdown / "read the question" lead, the answer-button grid, and the
// reveal answer card. Rendered by the real <PhoneScreen/> (inside its phone
// viewport frame, which also paints the reveal tint + candy rain) AND by the
// landing demo (inside a phone bezel), so the marketing preview can never drift
// from the product.
//
// Container-relative: it fills its parent (flex:1) and never reaches for the
// viewport, so each host just gives it a slot.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Choice } from "@/lib/quiz";
import { WaitingDots, LOBBY_DOT_COLORS } from "@/components/LobbyUi";
import { JellyButton } from "@/components/JellyButton";
import type { RoundPhase } from "@/lib/realtime/useGameState";

// Lead screen: big 3-2-1 during countdown, then "read the question".
function PlayerLead({ phase, n }: { phase: "countdown" | "reading"; n: number }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: 24 }}>
      {phase === "countdown" ? (
        <motion.div
          key={n}
          initial={reduce ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 104, lineHeight: 1, color: "var(--plum)" }}
        >
          {n}
        </motion.div>
      ) : (
        <>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, color: "var(--ink)" }}>問題を読んでね</div>
          <p style={{ margin: 0, color: "var(--ink-soft)", fontWeight: 500, fontSize: 14 }}>まもなく回答できます</p>
          <WaitingDots reduce={reduce ?? false} />
        </>
      )}
    </div>
  );
}

// "次の問題を待っています" — shimmer text + small bouncing dots, shown inline
// inside the reveal answer card (4px dots proportional to the 12.5px text).
function WaitingLine() {
  const reduce = useReducedMotion();
  return (
    <span style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 6, marginTop: 2 }}>
      <span className="puni-shimmer" style={{ fontSize: 12.5, fontWeight: 700 }}>
        次の問題を待っています
      </span>
      <span aria-hidden style={{ display: "inline-flex", alignItems: "flex-end", gap: 3, paddingBottom: 3 }}>
        {LOBBY_DOT_COLORS.map((c, i) => (
          <motion.span
            key={c}
            animate={reduce ? undefined : { y: [0, -4, 0] }}
            transition={
              reduce
                ? undefined
                : { duration: 1.3, repeat: Infinity, repeatDelay: 0.25, ease: "easeInOut", delay: i * 0.18 }
            }
            style={{ width: 4, height: 4, borderRadius: "50%", background: c }}
          />
        ))}
      </span>
    </span>
  );
}

export function PlayerBoard({
  choices,
  picked,
  correctId,
  revealed,
  onPick,
  roundPhase = null,
  countdownNumber = 0,
}: {
  choices: Choice[];
  picked: number | null;
  correctId: number;
  revealed: boolean;
  onPick: (key: string) => void;
  roundPhase?: RoundPhase;
  countdownNumber?: number;
}) {
  // correctId is only meaningful once revealed (-1 otherwise).
  const correct = revealed && correctId >= 0 ? choices[correctId] : undefined;
  const isRight = revealed && picked === correctId;
  const handlePick = (id: number) => {
    const choice = choices.find((c) => c.id === id);
    if (choice) onPick(choice.key);
  };

  // Lead — 3-2-1 countdown, then "read the question".
  if (roundPhase === "countdown" || roundPhase === "reading") {
    return <PlayerLead phase={roundPhase} n={countdownNumber} />;
  }

  // Reveal — the answer card. The full-screen tint + candy rain are painted by the
  // host frame/bezel (behind this), so the body itself stays transparent.
  if (revealed && correct) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}
      >
        <motion.div
          data-answer-card=""
          // Scale/opacity only (no y-translate): a translate shifts the card's
          // measured rect, mis-placing AnswerRain's collision body so candies land
          // embedded in the card. Scale is centre-origin (stable).
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          // Frosted card so the answer stays readable over the candies; it's also a
          // physics obstacle the rain bonks onto (see AnswerRain via PhoneFrame).
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: "24px 32px",
            borderRadius: 30,
            background: "rgba(255,255,255,0.74)",
            backdropFilter: "blur(7px)",
            WebkitBackdropFilter: "blur(7px)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 28,
              color: isRight ? "var(--sage-deep)" : "var(--rose-deep)",
            }}
          >
            {isRight ? "正解！" : "おしい！"}
          </span>
          {correct.image_url ? (
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 116,
                height: 116,
                borderRadius: "50%",
                overflow: "hidden",
                background: `color-mix(in srgb, ${correct.color} 16%, white)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={correct.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </span>
          ) : null}
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-soft)" }}>
            正解は <b style={{ color: "var(--ink)", fontFamily: "var(--font-display)" }}>{correct.label}</b>
          </span>
          <span style={{ width: "100%", height: 1, background: "rgba(90,57,214,0.12)", margin: "4px 0 0" }} />
          <WaitingLine />
        </motion.div>
      </motion.div>
    );
  }

  // Answering — the jelly answer-button grid.
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, textAlign: "center", fontSize: 22, margin: "10px 0 2px" }}>
        あなたの番です
      </h2>
      <p style={{ textAlign: "center", color: "var(--ink-soft)", fontWeight: 500, fontSize: 13, margin: "0 0 18px" }}>
        答えを選んでください
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: "0 18px 8px", flex: 1 }}>
        {choices.map((c, i) => (
          <JellyButton
            key={c.key}
            choice={c}
            index={i}
            picked={picked === c.id}
            dimmed={picked !== null && picked !== c.id}
            onPick={handlePick}
          />
        ))}
      </div>

      <div style={{ padding: "18px 18px 20px", textAlign: "center", minHeight: 60 }}>
        <AnimatePresence mode="wait">
          {picked !== null ? (
            <motion.p key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--sage-deep)" }}>
              送信しました。変更もできます
            </motion.p>
          ) : (
            <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--ink-soft)" }}>
              ひとつ選んでタップ
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

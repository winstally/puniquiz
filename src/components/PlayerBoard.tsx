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

import { useEffect, useRef } from "react";
import { m } from "motion/react";
import Image from "next/image";
import type { Choice } from "@/lib/quiz";
import { POINTS_UNIT } from "@/lib/quiz";
import { AnswerChoicePhoto } from "@/components/AnswerChoiceCard";
import { PLAYER_HAPTICS, playHaptic } from "@/lib/haptics";
import { ReadingWaitMessage } from "@/components/LobbyUi";
import { CountdownRing } from "@/components/CountdownRing";
import { JellyButton } from "@/components/JellyButton";
import { RevealSuspense } from "@/components/RevealSuspense";
import { COUNTDOWN_S, type RoundPhase } from "@/lib/realtime/useGameState";
import { PLAYER_REVEAL_CANDY_SIZE, glowHaloStyle } from "@/components/glow-halo";

const playerLeadStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 16,
  textAlign: "center",
  padding: 24,
} as const;

const revealRootStyle = {
  flex: 1,
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: 24,
} as const;

const answerCardStyle = {
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
} as const;

const missingAnswerStyle = {
  display: "grid",
  placeItems: "center",
  width: PLAYER_REVEAL_CANDY_SIZE,
  height: PLAYER_REVEAL_CANDY_SIZE,
  borderRadius: 20,
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 30,
  color: "var(--ink-soft)",
  background: "rgba(0,0,0,0.04)",
  border: "2px dashed color-mix(in oklch, var(--plum) 20%, var(--line))",
} as const;

// Lead screen: await — wait for the host's go (the phone is a controller, so
// just a calm "待っています"); countdown — a small 3-2-1 ring before answers open.
function PlayerLead({
  phase,
  n,
  hapticsEnabled,
}: {
  phase: "await" | "countdown";
  n: number;
  hapticsEnabled: boolean;
}) {
  useEffect(() => {
    if (!hapticsEnabled || phase !== "countdown" || n <= 0) return;
    playHaptic(PLAYER_HAPTICS.countdownTick);
  }, [hapticsEnabled, phase, n]);

  return (
    <div style={playerLeadStyle}>
      {phase === "countdown" ? (
        <CountdownRing seconds={n} total={COUNTDOWN_S} size={60} />
      ) : (
        <ReadingWaitMessage label="ホストの合図を待っています" />
      )}
    </div>
  );
}

// "次の問題を待っています" — shimmer text + the shared small bouncing dots, shown
// at the bottom of the reveal answer card. md text to match every other waiting line.
function WaitingLine() {
  return <ReadingWaitMessage label="次の問題を待っています" />;
}

// The answer's token under "あなたの回答" / "正解" in the reveal. Photo choices
// show the actual image (with the corner gummy), text-only choices keep the
// Kahoot-style colour/shape candy.
function Gummi({ choice }: { choice: Choice }) {
  if (choice.image_url) {
    return <AnswerChoicePhoto choice={choice} size={PLAYER_REVEAL_CANDY_SIZE} />;
  }
  return (
    <span
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: PLAYER_REVEAL_CANDY_SIZE,
        height: PLAYER_REVEAL_CANDY_SIZE,
      }}
    >
      <span
        aria-hidden
        style={glowHaloStyle(choice.color)}
      />
      <Image
        src={choice.icon}
        alt=""
        width={PLAYER_REVEAL_CANDY_SIZE}
        height={PLAYER_REVEAL_CANDY_SIZE}
        unoptimized
        style={{
          position: "relative",
          zIndex: 1,
          display: "block",
          width: PLAYER_REVEAL_CANDY_SIZE,
          height: PLAYER_REVEAL_CANDY_SIZE,
          objectFit: "contain",
          filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.16))",
        }}
      />
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
  answerChangeAllowed = false,
  awardedPoints = null,
  hapticsEnabled = false,
}: {
  choices: Choice[];
  picked: number | null;
  correctId: number;
  revealed: boolean;
  onPick: (key: string) => void;
  roundPhase?: RoundPhase;
  countdownNumber?: number;
  /** じっくりモード: 締切まで回答を変更できる（ボタンをロックしない）。 */
  answerChangeAllowed?: boolean;
  hapticsEnabled?: boolean;
  /** Points earned this round (set at reveal); speed-weighted only in 早押し
   *  with a time limit (じっくり／無制限 award full points). The phone is just
   *  a controller — the host screen shows the question's worth, so this personal
   *  gain is the only points the phone surfaces. */
  awardedPoints?: number | null;
}) {
  // correctId is only meaningful once revealed (-1 otherwise). During the
  // drumroll 溜め the server withholds correct_key, so correctId stays -1 (and
  // `correct` undefined) until reveal_answer arrives.
  const correct = revealed && correctId >= 0 ? choices[correctId] : undefined;
  const isRight = revealed && picked === correctId;
  const lastRevealHapticRef = useRef<string | null>(null);
  useEffect(() => {
    if (!revealed) {
      lastRevealHapticRef.current = null;
      return;
    }
    if (!hapticsEnabled || !correct) return;
    const key = `${correctId}:${picked ?? "none"}`;
    if (lastRevealHapticRef.current === key) return;
    lastRevealHapticRef.current = key;
    if (picked === null) {
      playHaptic(PLAYER_HAPTICS.noAnswerReveal);
    } else {
      playHaptic(isRight ? PLAYER_HAPTICS.correctReveal : PLAYER_HAPTICS.incorrectReveal);
    }
  }, [correct, correctId, hapticsEnabled, isRight, picked, revealed]);

  const handlePick = (id: number) => {
    const choice = choices.find((c) => c.id === id);
    if (!choice) return;
    onPick(choice.key);
  };

  // Lead — 3-2-1 countdown, then "read the question".
  if (roundPhase === "await" || roundPhase === "countdown") {
    return <PlayerLead phase={roundPhase} n={countdownNumber} hapticsEnabled={hapticsEnabled} />;
  }

  // Reveal 溜め — the server withholds the answer during the host's drumroll, so
  // show the shared suspense prompt until correct_key arrives (reveal_answer).
  if (revealed && !correct) {
    return <RevealSuspense variant="player" />;
  }

  // Reveal — the answer card. The full-screen tint + candy rain are painted by the
  // host frame/bezel (behind this), so the body itself stays transparent.
  if (revealed && correct) {
    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={revealRootStyle}
      >
        <m.div
          data-answer-card=""
          // Scale/opacity only (no y-translate): a translate shifts the card's
          // measured rect, mis-placing AnswerRain's collision body so candies land
          // embedded in the card. Scale is centre-origin (stable).
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          // Frosted card so the answer stays readable over the candies; it's also a
          // physics obstacle the rain bonks onto (see AnswerRain via PhoneFrame).
          style={answerCardStyle}
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
          {/* Points gained (speed-weighted only in 早押し). Only correct answers
              score, so the +pt only shows when right. */}
          {isRight && awardedPoints != null && awardedPoints > 0 ? (
            <m.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.12 }}
              style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, lineHeight: 1, color: "var(--sage-deep)", fontVariantNumeric: "tabular-nums", marginTop: -2 }}
            >
              +{awardedPoints}
              <span style={{ fontSize: 12, marginLeft: 1 }}>{POINTS_UNIT}</span>
            </m.div>
          ) : null}
          {/* Kahoot-style: your answer vs the correct one as candy tokens
              (colour/shape only — no answer text), side by side. A couple seconds
              later both colours rain + mix over this (see PhoneScreen rainDelay). */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 30, marginTop: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", letterSpacing: "0.04em" }}>
                あなたの回答
              </span>
              {picked !== null && choices[picked] ? (
                <Gummi choice={choices[picked]} />
              ) : (
                <span style={missingAnswerStyle}>
                  ?
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", letterSpacing: "0.04em" }}>
                正解
              </span>
              <Gummi choice={correct} />
            </div>
          </div>
          <span style={{ width: "100%", height: 1, background: "rgba(90,57,214,0.12)", margin: "8px 0 0" }} />
          <WaitingLine />
        </m.div>
      </m.div>
    );
  }

  // Answering — the jelly answer-button grid. In じっくり mode nothing locks:
  // players can re-tap to change their answer until the round closes.
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, textAlign: "center", fontSize: 22, margin: "10px 0 2px" }}>
        どれが正解？
      </h2>
      <p style={{ textAlign: "center", color: "var(--ink-soft)", fontWeight: 500, fontSize: 13, margin: "0 0 14px" }}>
        {answerChangeAllowed ? "答えを選んでタップ（あとから変更OK）" : "答えを選んでタップ！"}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: "0 18px 8px", flex: 1 }}>
        {choices.map((c, i) => (
          <JellyButton
            key={c.key}
            choice={c}
            index={i}
            picked={picked === c.id}
            dimmed={picked !== null && picked !== c.id}
            locked={!answerChangeAllowed && picked !== null}
            onPick={handlePick}
          />
        ))}
      </div>

      <div style={{ padding: "18px 18px 20px", textAlign: "center", minHeight: 60 }}>
        {picked !== null ? (
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--sage-deep)" }}>
            {answerChangeAllowed ? "回答しました（タップで変更できます）" : "回答を送信しました！"}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--ink-soft)" }}>
            ひとつ選んでタップ
          </p>
        )}
      </div>
    </div>
  );
}

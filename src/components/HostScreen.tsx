"use client";

import { AnimatePresence, m } from "motion/react";
import Image from "next/image";
import type { Choice } from "@/lib/quiz";
import { ROUND_SECONDS, POINTS_UNIT, QUESTION_IMAGE_ASPECT } from "@/lib/quiz";
import { Card } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { HostChoiceCard } from "@/components/HostChoiceCard";
import { AnswerChoicePhoto } from "@/components/AnswerChoiceCard";
import { CountdownRing } from "@/components/CountdownRing";
import { COUNTDOWN_S, type RoundPhase } from "@/lib/realtime/useGameState";

// A roster avatar (driven by Presence).
export type RosterAvatar = { initial: string; bg: string };

type HostScreenProps = {
  choices: Choice[];
  eyebrow: string;
  question: string;
  /** Optional question image (Storage URL for real quizzes, /public path for the demo). */
  media?: string | null;
  votes: number[];
  seconds: number;
  /** Round length for the ring ratio; falls back to ROUND_SECONDS until a
   *  question's time_limit_seconds is available. */
  totalSeconds?: number;
  /** Index of the correct choice — only meaningful while `revealed`; -1 = none. */
  correctId: number;
  revealed: boolean;
  /** Number of correct answers this round (shown at reveal). */
  correctCount?: number;
  /** Connected roster avatars (from Presence). */
  roster: RosterAvatar[];
  /** Authoritative connected player count (from Presence). */
  count: number;
  /** Live-question sub-phase (await → countdown → answering), null otherwise. */
  roundPhase?: RoundPhase;
  /** 3-2-1 number during the countdown sub-phase. */
  countdownNumber?: number;
  /** This question's worth — full points for an instant correct answer. */
  points?: number | null;
  /** Manual question (no time limit): no answer-timer ring; host closes by hand. */
  manual?: boolean;
  /** Real big screen: fill vertical space so the parked question centres then
   *  eases up. The compact LP demo leaves it false (top-aligned). */
  tall?: boolean;
  /** LP demo uses a fixed viewport so every phase keeps the same footprint. */
  variant?: "live" | "demo";
};

const headingStyle = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  color: "var(--ink)",
  lineHeight: 1.26,
  letterSpacing: "0.005em",
  margin: 0,
  textWrap: "balance",
} as const;

const imageStyle = {
  objectFit: "contain",
  display: "block",
} as const;

const manualPulseSlotStyle = {
  width: 48,
  height: 48,
  flex: "0 0 auto",
  display: "grid",
  placeItems: "center",
} as const;

const manualPulseDotStyle = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "var(--plum)",
  display: "block",
} as const;

const statusLineStyle = {
  flex: 1,
  minWidth: 0,
  fontWeight: 500,
  fontSize: 15,
  color: "var(--ink-soft)",
} as const;

const strongStatusStyle = {
  color: "var(--ink)",
  fontWeight: 700,
} as const;

const tabularStatusStyle = {
  color: "var(--ink)",
  fontFamily: "var(--font-display)",
  fontVariantNumeric: "tabular-nums",
} as const;

const statusSeparatorStyle = {
  margin: "0 8px",
  color: "var(--line)",
} as const;

const questionPointsBadgeStyle = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 3,
  alignSelf: "center",
  padding: "4px 13px",
  borderRadius: 999,
  background: "color-mix(in oklch, var(--plum) 12%, #fff)",
  color: "var(--plum-deep)",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 13,
  fontVariantNumeric: "tabular-nums",
} as const;

function hostCardStyle(demo: boolean) {
  return {
    gap: 0,
    borderRadius: 0,
    border: "none",
    background: "transparent",
    padding: "clamp(24px,4vh,56px) clamp(16px,2.5vw,36px) 32px",
    boxShadow: "none",
    overflow: "visible",
    height: demo ? "100%" : undefined,
  } as const;
}

function boardPanelStyle(demo: boolean, tall: boolean, isAwait: boolean) {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: demo ? 14 : "clamp(20px,3vh,34px)",
    minHeight: tall ? "58vh" : undefined,
    height: demo ? "100%" : undefined,
    justifyContent: demo ? "center" : tall && isAwait ? "center" : "flex-start",
  } as const;
}

function hostMediaStyle(demo: boolean) {
  return {
    width: "100%",
    maxWidth: demo ? 460 : 520,
    // Fixed 16:10 frame (SSOT) everywhere — the whole image always shows (contain),
    // so nothing is cropped on the editor, host screen, or the landing demo.
    aspectRatio: QUESTION_IMAGE_ASPECT,
    position: "relative",
    flexShrink: 0,
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: "0 22px 50px -18px rgba(50,25,90,0.32)",
    background: "color-mix(in oklch, var(--plum) 5%, #fff)",
  } as const;
}

function answerAreaStyle(demo: boolean) {
  return {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: demo ? 14 : "clamp(16px,2.4vh,26px)",
  } as const;
}

function answerGridStyle(demo: boolean) {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
    gap: demo ? 12 : 16,
  } as const;
}

function revealPanelStyle(demo: boolean) {
  return {
    display: "flex",
    flexDirection: "column",
    gap: demo ? 12 : 16,
    alignItems: "center",
    height: demo ? "100%" : undefined,
  } as const;
}

function revealMediaStyle(demo: boolean) {
  return {
    width: "100%",
    maxWidth: demo ? 360 : 420,
    aspectRatio: QUESTION_IMAGE_ASPECT,
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
    background: "color-mix(in oklch, var(--plum) 5%, #fff)",
  } as const;
}

function correctPanelStyle(color: string) {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    width: "100%",
    maxWidth: 440,
    margin: "10px auto 0",
    background: `color-mix(in srgb, ${color} 9%, #fff)`,
    border: `1px solid color-mix(in srgb, ${color} 24%, #fff)`,
    borderRadius: 28,
    padding: "16px 24px 26px",
  } as const;
}

function correctEyebrowStyle(color: string) {
  return {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: 3,
    color: `color-mix(in srgb, ${color} 60%, var(--ink-soft))`,
  } as const;
}

// Shared "who's here" stack: up to 4 avatars + the authoritative count. Used on
// the in-game board AND in the host header so presence reads identically in every
// phase (one source — usePresence, where count === roster.length).
export function PlayerRow({ roster, count }: { roster: RosterAvatar[]; count: number }) {
  // Show at most 4 avatars; the numeric count is authoritative. Overlapping stack
  // (negative margin) with the `stacked` white seam ring so the circles read as
  // separate cut-outs — leftmost on top. The count follows after the stack.
  const shown = roster.slice(0, 4);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700, color: "var(--ink-soft)", fontSize: 14, flex: "0 0 auto" }}>
      <span style={{ display: "flex" }}>
        {shown.map((p, i) => (
          <span
            key={`${p.initial}-${p.bg}`}
            style={{ marginLeft: i === 0 ? 0 : -8, position: "relative", zIndex: shown.length - i }}
          >
            <PlayerAvatar initial={p.initial} color={p.bg} size="md" stacked />
          </span>
        ))}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{count}</span>人
    </span>
  );
}

// This question's worth, shown on the big screen so everyone knows the stake.
// Speed-weighted: full points for an instant correct answer, down to half.
function QuestionPointsBadge({ points }: { points: number }) {
  return (
    <span style={questionPointsBadgeStyle}>
      <span style={{ fontSize: 16 }}>{points}</span>{POINTS_UNIT}
      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7, marginLeft: 3 }}>速いほど高得点</span>
    </span>
  );
}

function BoardPanel({
  choices,
  question,
  media,
  votes,
  total,
  seconds,
  totalSeconds,
  roundPhase,
  countdownNumber,
  points,
  manual,
  tall,
  demo,
}: {
  choices: Choice[];
  question: string;
  media: string | null;
  votes: number[];
  total: number;
  seconds: number;
  totalSeconds: number;
  roundPhase: RoundPhase;
  countdownNumber: number;
  points: number | null;
  manual: boolean;
  tall: boolean;
  demo: boolean;
}) {
  const isAwait = roundPhase === "await";
  const isCountdown = roundPhase === "countdown";
  const showTimerRing = isCountdown || !manual;

  return (
    <m.div
      key="board"
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      style={boardPanelStyle(demo, tall, isAwait)}
    >
      <m.h2 layout="position" style={{ ...headingStyle, textAlign: "center", fontSize: demo ? "clamp(24px,3.1vw,34px)" : "clamp(28px,3.8vw,46px)" }}>
        {question}
      </m.h2>

      {points ? (
        <m.div layout="position">
          <QuestionPointsBadge points={points} />
        </m.div>
      ) : null}

      {media ? (
        <m.div layout style={hostMediaStyle(demo)}>
          <Image
            src={media}
            alt=""
            fill
            sizes={demo ? "460px" : "520px"}
            unoptimized
            style={imageStyle}
          />
        </m.div>
      ) : null}

      {!isAwait ? (
        <m.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: "easeOut" }}
          style={answerAreaStyle(demo)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {showTimerRing ? (
              <CountdownRing
                seconds={isCountdown ? countdownNumber : seconds}
                total={isCountdown ? COUNTDOWN_S : totalSeconds}
                size={48}
                warnAt={isCountdown ? 1 : 5}
              />
            ) : (
              <div style={manualPulseSlotStyle}>
                <m.span
                  aria-hidden
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.55, 1] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                  style={manualPulseDotStyle}
                />
              </div>
            )}
            <AnswerStatus isCountdown={isCountdown} manual={manual} seconds={seconds} total={total} />
          </div>

          <div style={answerGridStyle(demo)}>
            {choices.map((c, i) => (
              <HostChoiceCard key={c.id} choice={c} votes={votes[c.id] ?? 0} total={total} index={i} />
            ))}
          </div>
        </m.div>
      ) : null}
    </m.div>
  );
}

function AnswerStatus({
  isCountdown,
  manual,
  seconds,
  total,
}: {
  isCountdown: boolean;
  manual: boolean;
  seconds: number;
  total: number;
}) {
  return (
    <div style={statusLineStyle}>
      {isCountdown ? (
        <span style={strongStatusStyle}>まもなく回答開始</span>
      ) : manual ? (
        <>
          <span style={strongStatusStyle}>回答受付中</span>
          <span style={statusSeparatorStyle}>·</span>
          <b style={tabularStatusStyle}>{total}人</b>が回答
        </>
      ) : (
        <>
          <span style={{ ...strongStatusStyle, fontVariantNumeric: "tabular-nums" }}>残り{seconds}秒</span>
          <span style={statusSeparatorStyle}>·</span>
          <b style={tabularStatusStyle}>{total}人</b>が回答
        </>
      )}
    </div>
  );
}

function RevealPanel({
  choices,
  question,
  media,
  votes,
  total,
  correctId,
  correctCount,
  demo,
}: {
  choices: Choice[];
  question: string;
  media: string | null;
  votes: number[];
  total: number;
  correctId: number;
  correctCount: number;
  demo: boolean;
}) {
  const correct = correctId >= 0 ? choices[correctId] : undefined;
  const correctVotes = correct ? Math.max(correctCount, votes[correctId] ?? 0) : 0;
  const denom = Math.max(total, correctVotes);
  const correctPct = denom ? Math.round((correctVotes / denom) * 100) : 0;

  return (
    <m.div
      key="reveal"
      initial={{ opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={revealPanelStyle(demo)}
    >
      <h2 style={{ ...headingStyle, fontSize: "clamp(22px,2.8vw,30px)", textAlign: "center", width: "100%" }}>{question}</h2>

      {media ? (
        <div style={revealMediaStyle(demo)}>
          <Image
            src={media}
            alt=""
            fill
            sizes={demo ? "360px" : "420px"}
            unoptimized
            style={imageStyle}
          />
        </div>
      ) : null}

      {correct ? (
        <m.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
          style={correctPanelStyle(correct.color)}
        >
          <span style={correctEyebrowStyle(correct.color)}>正解は…</span>
          <m.div
            initial={{ scale: 0.4, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.12 }}
            style={{ display: "inline-grid", placeItems: "center" }}
          >
            {correct.image_url ? (
              <AnswerChoicePhoto choice={correct} size={172} />
            ) : (
              <Image
                src={correct.icon}
                alt=""
                width={168}
                height={168}
                unoptimized
                style={{ width: "clamp(132px,18vw,168px)", height: "auto", objectFit: "contain", display: "block", filter: "drop-shadow(0 14px 20px rgba(40,28,64,0.22))" }}
              />
            )}
          </m.div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(26px,3.6vw,36px)", color: "var(--ink)" }}>
            {correct.label}
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-soft)" }}>
            {correctVotes}人が正解（{correctPct}%）
          </span>
        </m.div>
      ) : null}
    </m.div>
  );
}

export function HostScreen({
  choices,
  question,
  media = null,
  votes,
  seconds,
  totalSeconds = ROUND_SECONDS,
  correctId,
  revealed,
  correctCount = 0,
  roundPhase = null,
  countdownNumber = 0,
  points = null,
  manual = false,
  tall = false,
  variant = "live",
}: HostScreenProps) {
  const total = votes.reduce((a, b) => a + b, 0);
  const demo = variant === "demo";

  return (
    <Card aria-label="ホスト画面" style={hostCardStyle(demo)}>
      <AnimatePresence mode="wait" initial={false}>
        {!revealed ? (
          <BoardPanel
            choices={choices}
            question={question}
            media={media}
            votes={votes}
            total={total}
            seconds={seconds}
            totalSeconds={totalSeconds}
            roundPhase={roundPhase}
            countdownNumber={countdownNumber}
            points={points}
            manual={manual}
            tall={tall}
            demo={demo}
          />
        ) : (
          <RevealPanel
            choices={choices}
            question={question}
            media={media}
            votes={votes}
            total={total}
            correctId={correctId}
            correctCount={correctCount}
            demo={demo}
          />
        )}
      </AnimatePresence>
    </Card>
  );
}

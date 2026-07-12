"use client";

import type { Choice } from "@/lib/quiz";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  JoinCodeDisplay,
  LobbyBody,
  LobbyCard,
  LobbyHeader,
  LobbyHeroGlow,
  LobbyReloadHint,
  LobbyWaitingHeading,
  PlayerIdentityPill,
  PlayerLeaveButton,
} from "@/components/LobbyUi";
import { AnswerRain } from "./AnswerRain";
import { PlayerBoard } from "@/components/PlayerBoard";
import { PlayerStanding } from "@/components/PlayerStanding";
import { pageShell } from "@/lib/layout";
import { PLAYER_HAPTICS, playHaptic } from "@/lib/haptics";
import type { RoundPhase } from "@/lib/realtime/useGameState";

const phoneContentLayerStyle = {
  position: "relative",
  zIndex: 1,
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
} as const;

const waitingStatusStyle = {
  display: "contents",
} as const;

const waitingCardStyle = {
  gap: 16,
  padding: "28px 24px",
  minWidth: "min(100%, 320px)",
} as const;

const waitingNameStyle = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 22,
  color: "var(--ink)",
  maxWidth: 240,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

function phoneFrameStyle(tint: string | undefined) {
  return {
    ...pageShell,
    position: "relative",
    boxSizing: "border-box",
    height: "100svh",
    minHeight: "100svh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundImage: tint,
  } as const;
}

const HAPTIC_TARGET_SELECTOR = [
  "button",
  "a[href]",
  "[role='button']",
  "input[type='button']",
  "input[type='submit']",
].join(",");

function shouldHapticForTarget(
  target: EventTarget | null,
  currentTarget: HTMLElement,
): boolean {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest<HTMLElement>(HAPTIC_TARGET_SELECTOR);
  if (!interactive || !currentTarget.contains(interactive)) return false;
  if (interactive.hasAttribute("disabled")) return false;
  if (interactive.getAttribute("aria-disabled") === "true") return false;
  return true;
}

// Player viewport — Brand + identity pill header; PIN lives in the lobby body only.
function PhoneFrame({
  children,
  nickname,
  avatarInitial,
  avatarColor,
  connecting,
  onLeave,
  tint,
  rain,
  rainDelay,
  hapticsEnabled = true,
}: {
  children: React.ReactNode;
  nickname?: string | null;
  avatarInitial: string;
  avatarColor?: string | null;
  connecting?: boolean;
  onLeave?: () => void;
  /** Optional full-screen wash painted behind the whole frame (header + body),
   *  fading into the page background. Used by the reveal so the tint has no
   *  seams at the top, sides, or bottom. */
  tint?: string;
  /** Optional answer-candy icon(s) to rain across the whole frame (reveal only).
   *  Two icons → the colours alternate and mix. */
  rain?: string[];
  /** Lead (ms) before the rain starts (lets the static panel read first). */
  rainDelay?: number;
  /** Best-effort vibration feedback for play-side button taps. */
  hapticsEnabled?: boolean;
}) {
  const displayNickname = nickname?.trim() || null;

  return (
    <div
      style={phoneFrameStyle(tint)}
      onPointerDownCapture={(event) => {
        if (!hapticsEnabled) return;
        if (!shouldHapticForTarget(event.target, event.currentTarget)) return;
        playHaptic(PLAYER_HAPTICS.buttonTap);
      }}
    >
      {/* Candy rain fills the WHOLE frame, in front of the content (reveal). */}
      {rain && rain.length ? <AnswerRain srcs={rain} delay={rainDelay} /> : null}
      {/* Content sits above the rain so the header + answer stay visible. */}
      <div style={phoneContentLayerStyle}>
        <LobbyHeader>
          {onLeave ? <PlayerLeaveButton onClick={onLeave} /> : null}
          {displayNickname ? (
            <PlayerIdentityPill
              nickname={displayNickname}
              initial={avatarInitial}
              color={avatarColor}
              connecting={connecting}
            />
          ) : null}
        </LobbyHeader>
        {children}
      </div>
    </div>
  );
}

export function PhoneScreen({
  choices,
  picked,
  correctId,
  revealed,
  onPick,
  nickname = null,
  finalNickname = null,
  initial,
  avatarColor,
  pin,
  // --- New optional state props (backward compatible) ----------------------
  /** Lobby: game hasn't started — show a calm waiting screen. */
  waiting = false,
  /** Boot/sync stalled — suggest a full page reload. */
  showReloadHint = false,
  /** Channel is reconnecting/errored — show a small "再接続中…" pill. */
  connecting = false,
  /** Game over — show this player's own final result (rank + points). */
  ended = false,
  /** Between rounds — show a brief "現在 X位" standings interstitial. */
  scoreboard = false,
  /** This player's 1-based rank from the leaderboard, or null if unranked. */
  rank = null,
  /** This player's total points. */
  points = 0,
  /** Current quiz's maximum possible total score. */
  maxPoints = 0,
  /** Number of ranked players (for "X人中 Y位" context). */
  totalPlayers = 0,
  roundPhase = null,
  countdownNumber = 0,
  answerChangeAllowed = false,
  hapticsEnabled = true,
  awardedPoints = null,
  onLeave,
}: {
  choices: Choice[];
  picked: number | null;
  correctId: number;
  revealed: boolean;
  // Receives the stable choice key (matches HostScreen's key-based model),
  // resolved here from JellyButton's numeric id.
  onPick: (key: string) => void;
  nickname?: string | null;
  finalNickname?: string | null;
  initial?: string;
  avatarColor?: string | null;
  pin?: string;
  waiting?: boolean;
  showReloadHint?: boolean;
  connecting?: boolean;
  ended?: boolean;
  scoreboard?: boolean;
  rank?: number | null;
  points?: number;
  maxPoints?: number;
  totalPlayers?: number;
  /** Live-question sub-phase (countdown → reading → answering), null otherwise. */
  roundPhase?: RoundPhase;
  /** 3-2-1 number during the countdown sub-phase. */
  countdownNumber?: number;
  /** じっくりモード: 締切まで回答を変更できる（ボタンをロックしない）。 */
  answerChangeAllowed?: boolean;
  /** Best-effort vibration feedback on supported play-side devices. */
  hapticsEnabled?: boolean;
  /** Points earned this round (set at reveal); speed-weighted. Shown small on
   *  the phone — the host screen owns the question's worth. */
  awardedPoints?: number | null;
  /** Cancel participation — leave the game and return home. */
  onLeave?: () => void;
}) {
  // correctId is only meaningful once revealed (-1 otherwise) — keep `correct`
  // undefined pre-reveal so the answer can never render early.
  const correct = revealed && correctId >= 0 ? choices[correctId] : undefined;
  const isRight = revealed && picked === correctId;
  // First grapheme of the nickname as the avatar fallback when no explicit
  // initial is supplied.
  const avatarInitial = initial ?? (nickname ? [...nickname][0] : "?");
  const headerProps = { nickname, avatarInitial, avatarColor, connecting, onLeave };

  // -------------------------------------------------------------------------
  // WAITING (lobby) — game exists but no question yet (snapshot may still sync).
  // -------------------------------------------------------------------------
  if (waiting) {
    return (
      <PhoneFrame {...headerProps} hapticsEnabled={hapticsEnabled}>
        <WaitingScreen
          nickname={nickname}
          avatarInitial={avatarInitial}
          avatarColor={avatarColor}
          pin={pin}
          showReloadHint={showReloadHint}
        />
      </PhoneFrame>
    );
  }

  // -------------------------------------------------------------------------
  // ENDED — this player's own final result (rank + total points), with a
  // celebratory treatment scaled by placement (crown / 優勝！ for 1st).
  // -------------------------------------------------------------------------
  if (ended) {
    return (
      <PhoneFrame {...headerProps} hapticsEnabled={hapticsEnabled}>
        <PlayerStanding
          final
          nickname={finalNickname}
          rank={rank}
          points={points}
          maxPoints={maxPoints}
          totalPlayers={totalPlayers}
        />
      </PhoneFrame>
    );
  }

  // -------------------------------------------------------------------------
  // SCOREBOARD — between-rounds standing (same PlayerStanding, calm/no confetti).
  // -------------------------------------------------------------------------
  if (scoreboard) {
    return (
      <PhoneFrame {...headerProps} hapticsEnabled={hapticsEnabled}>
        <PlayerStanding
          final={false}
          rank={rank}
          points={points}
          maxPoints={maxPoints}
          totalPlayers={totalPlayers}
        />
      </PhoneFrame>
    );
  }

  // -------------------------------------------------------------------------
  // IN-QUESTION — countdown / reading / answering / reveal, all via the shared
  // PlayerBoard. The reveal tint + candy rain are painted by the frame behind it.
  // -------------------------------------------------------------------------
  return (
    <PhoneFrame
      {...headerProps}
      hapticsEnabled={hapticsEnabled}
      // On reveal, wash the WHOLE frame (behind the header too) and fade it into
      // the page bg — so there's no seam at the top, sides, or bottom.
      tint={
        revealed && correct
          ? isRight
            ? "linear-gradient(180deg,#eafaf2 0%,#f7f5fb 60%)"
            : "linear-gradient(180deg,#fdeef2 0%,#f7f5fb 60%)"
          : undefined
      }
      // Reveal: hold back the answer during the ~7s drumroll "溜め", then at the
      // climax rain the correct colour + the player's pick — two colours that mix.
      rain={
        revealed && correct
          ? Array.from(
              new Set([
                correct.icon,
                ...(picked !== null && choices[picked] ? [choices[picked].icon] : []),
              ]),
            )
          : undefined
      }
      rainDelay={0}
    >

      <PlayerBoard
        choices={choices}
        picked={picked}
        correctId={correctId}
        revealed={revealed}
        onPick={onPick}
        roundPhase={roundPhase}
        countdownNumber={countdownNumber}
        answerChangeAllowed={answerChangeAllowed}
        hapticsEnabled={hapticsEnabled}
        awardedPoints={awardedPoints}
      />
    </PhoneFrame>
  );
}

// -----------------------------------------------------------------------------
// WAITING (lobby) — mirrors host LobbyView: shimmer heading + hero card + PIN.
// -----------------------------------------------------------------------------
function WaitingScreen({
  nickname,
  avatarInitial,
  avatarColor,
  pin,
  showReloadHint = false,
}: {
  nickname?: string | null;
  avatarInitial: string;
  avatarColor?: string | null;
  pin?: string;
  showReloadHint?: boolean;
}) {
  const displayName = nickname?.trim() ?? "";
  const showIdentityCard = Boolean(displayName || pin);

  return (
    <LobbyBody>
      <div role="status" aria-live="polite" style={waitingStatusStyle}>
        <LobbyWaitingHeading size="sm">ゲーム開始を待っています</LobbyWaitingHeading>
        {showIdentityCard ? (
          <LobbyHeroGlow>
            <LobbyCard style={waitingCardStyle}>
              {displayName ? (
                <>
                  <PlayerAvatar
                    nickname={displayName}
                    initial={avatarInitial}
                    color={avatarColor}
                    size="2xl"
                  />
                  <span
                    style={waitingNameStyle}
                  >
                    {displayName}
                  </span>
                </>
              ) : null}
              {pin ? <JoinCodeDisplay pin={pin} /> : null}
            </LobbyCard>
          </LobbyHeroGlow>
        ) : null}
        {showReloadHint ? <LobbyReloadHint /> : null}
      </div>
    </LobbyBody>
  );
}

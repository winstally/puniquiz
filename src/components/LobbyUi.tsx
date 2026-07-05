"use client";

import type { CSSProperties, ReactNode } from "react";
import { m, useReducedMotion } from "motion/react";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/Brand";
import { PuniButton } from "@/components/PuniButton";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Status } from "@/components/ui/status";
import { softPillStyle } from "@/components/lobby-styles";
import { glowHaloStyle } from "@/components/glow-halo";
import { formatPin } from "@/lib/pin";

/** Bouncing-dot palette — shared by host lobby heading and player waiting. */
const LOBBY_DOT_COLORS = ["#5a39d6", "#7c5cfc", "#9b85ff"] as const;

const playerIdentityNameStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 14,
  color: "var(--ink-soft)",
  maxWidth: 120,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const lobbyBodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: "1 1 auto",
  minHeight: 0,
  gap: "clamp(24px,3.2vw,36px)",
  textAlign: "center",
  padding: "clamp(28px,4vw,52px) 16px 24px",
  boxSizing: "border-box",
  width: "100%",
};

const lobbyCardBaseStyle: CSSProperties = {
  background: "#fff",
  borderRadius: 26,
  padding: 16,
  boxShadow: "var(--shadow-card)",
  border: "1px solid var(--hairline)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  flex: "0 0 auto",
};

const lobbyHeadingStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  lineHeight: 1.12,
  margin: 0,
  maxWidth: "100%",
  textAlign: "center",
  whiteSpace: "nowrap",
};

/** Header pill — "参加コード" + grouped PIN (host header, player header). The
 *  frame always renders; the code shows a muted placeholder until the PIN lands,
 *  so a host reload never makes the pill disappear — it just fills in. */
function JoinCodePill({ pin }: { pin: string | null }) {
  return (
    <div style={{ ...softPillStyle("9px 20px"), gap: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: "var(--ink-soft)",
          lineHeight: 1.15,
        }}
      >
        参加
        <br />
        コード
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 26,
          letterSpacing: 6,
          color: pin ? "var(--ink)" : "var(--line)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pin ? formatPin(pin) : "−−−−−−"}
      </div>
    </div>
  );
}

/** Card/footer PIN block — same typography as the QR card bottom. */
export function JoinCodeDisplay({ pin }: { pin: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 3,
          color: "var(--ink-soft)",
        }}
      >
        参加コード
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          fontSize: 32,
          letterSpacing: 6,
          lineHeight: 1.1,
          color: "var(--plum)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatPin(pin)}
      </span>
    </div>
  );
}

/** Lobby card shell — white rounded card (QR card, player identity hero). */
export function LobbyCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{ ...lobbyCardBaseStyle, ...style }}
    >
      {children}
    </div>
  );
}

/** Pulsing plum glow behind lobby hero cards (QR / player avatar). */
export function LobbyHeroGlow({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, scale: 0.94, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      style={{ position: "relative", zIndex: 1 }}
    >
      <m.div
        aria-hidden
        animate={reduce ? undefined : { opacity: [0.4, 0.85, 0.4], scale: [0.95, 1.06, 0.95] }}
        transition={reduce ? undefined : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          ...glowHaloStyle("var(--plum)", { inset: -24, borderRadius: 46 }),
          zIndex: 0,
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </m.div>
  );
}

/** Shimmer heading + inline bouncing dots (host + player lobby). */
export function LobbyWaitingHeading({
  children,
  size = "lg",
}: {
  children: ReactNode;
  size?: "sm" | "lg";
}) {
  const compact = size === "sm";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: compact ? 6 : 8,
        flexWrap: "nowrap",
        maxWidth: "100%",
        whiteSpace: "nowrap",
      }}
    >
      <h2
        className="puni-shimmer"
        style={{
          ...lobbyHeadingStyle,
          fontSize: compact ? "clamp(24px,5.2vw,32px)" : "clamp(28px,3.6vw,42px)",
        }}
      >
        {children}
      </h2>
      <BouncingDots size={compact ? "sm" : "md"} />
    </div>
  );
}

// BouncingDots — the SINGLE bouncing "…" loader, one implementation for every
// waiting line (lobby heading + standalone wait), so dot size / bounce / timing
// never drift across two copies. `xs` is the small standalone size; `sm`/`md`
// sit beside the big lobby shimmer headings. Self-contained reduced-motion.
// The three dots share a bottom edge (flex-end) and bounce up from it; the PARENT
// decides where the row sits relative to its label.
function BouncingDots({ size = "md" }: { size?: "xs" | "sm" | "md" }) {
  const reduce = useReducedMotion();
  const dotSize = size === "xs" ? 5 : size === "sm" ? 8 : 10;
  const gap = size === "md" ? 6 : 5;
  const bounce = size === "xs" ? -6 : size === "sm" ? -7 : -9;
  const duration = size === "xs" ? 1.3 : 1.5;
  const step = size === "xs" ? 0.18 : 0.22;
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "flex-end", gap }}>
      {LOBBY_DOT_COLORS.map((c, i) => (
        <m.span
          key={c}
          animate={reduce ? undefined : { y: [0, bounce, 0] }}
          transition={
            reduce
              ? undefined
              : { duration, repeat: Infinity, repeatDelay: 0.3, ease: "easeInOut", delay: i * step }
          }
          style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: c }}
        />
      ))}
    </span>
  );
}

export function ReadingWaitMessage({
  label = "まもなく回答できます",
  size = "md",
}: {
  label?: string;
  size?: "sm" | "md";
}) {
  // Dots: the shared <BouncingDots/> (one source of truth — fixed small `xs` so it
  // never drifts vs the lobby heading). Only the LABEL text scales with `size`.
  const columnGap = 11;
  const height = size === "sm" ? 22 : 42;

  return (
    <span
      aria-live="polite"
      style={{
        display: "inline-flex",
        // Baseline-align the dots with the label so they sit at the bottom of the
        // text (like a trailing "…"), not floating in its middle.
        alignItems: "baseline",
        justifyContent: "center",
        columnGap,
        minHeight: height,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span
        className="puni-shimmer"
        style={{
          fontSize: size === "sm" ? 12.5 : 16,
          fontWeight: 700,
          fontFamily: "var(--font-display)",
        }}
      >
        {label}
      </span>
      <BouncingDots size="xs" />
    </span>
  );
}

/** Player header — self identity + connection status. */
export function PlayerIdentityPill({
  nickname,
  initial,
  color,
  connecting,
}: {
  nickname: string;
  initial: string;
  color?: string | null;
  connecting?: boolean;
}) {
  return (
    <span aria-live="polite" style={softPillStyle()}>
      {connecting ? (
        <Status variant="degraded" aria-label="再接続しています" />
      ) : (
        <Status variant="online" aria-label="接続中" />
      )}
      <PlayerAvatar nickname={nickname} initial={initial} color={color} size="md" />
      <span style={playerIdentityNameStyle}>
        {nickname}
      </span>
    </span>
  );
}

/** Player leave — distinct from identity pills so exit is easy to spot. */
export function PlayerLeaveButton({ onClick }: { onClick: () => void }) {
  return (
    <PuniButton
      variant="soft"
      size="sm"
      tone="rose"
      icon={LogOut}
      onClick={onClick}
      aria-label="ゲームから退出する"
    >
      退出する
    </PuniButton>
  );
}

/** Shared lobby header — Brand left, pills right (host + player). */
export function LobbyHeader({
  pin,
  children,
}: {
  pin?: string | null;
  children?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 30,
        flexWrap: "wrap",
        width: "100%",
      }}
    >
      <Brand />
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {children}
        {pin ? <JoinCodePill pin={pin} /> : null}
      </div>
    </header>
  );
}

/** Lobby body column — shared padding/gap for host QR + player waiting. */
export function LobbyBody({ children }: { children: ReactNode }) {
  return (
    <div
      style={lobbyBodyStyle}
    >
      {children}
    </div>
  );
}

/** Shown when session/snapshot sync stalls — nudge a full page reload. */
export function LobbyReloadHint({ onReload }: { onReload?: () => void }) {
  const reload = onReload ?? (() => window.location.reload());
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        maxWidth: 300,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 500,
          color: "var(--ink-soft)",
          lineHeight: 1.6,
        }}
      >
        読み込みが終わらない場合は、画面を更新してください
      </p>
      <PuniButton variant="ghost" size="sm" tone="plum" onClick={reload}>
        画面を更新
      </PuniButton>
    </div>
  );
}

"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/Brand";
import { PuniButton } from "@/components/PuniButton";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { PlayerRow, type RosterAvatar } from "@/components/HostScreen";
import { Status } from "@/components/ui/status";
import { formatPin } from "@/lib/pin";

/** Bouncing-dot palette — shared by host lobby heading and player waiting. */
export const LOBBY_DOT_COLORS = ["#5a39d6", "#7c5cfc", "#9b85ff"] as const;

/** White pill chrome used in host header, player header, and presence rows. */
export function softPillStyle(padding = "7px 16px 7px 13px"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "#fff",
    borderRadius: 999,
    padding,
    boxShadow: "var(--shadow-soft)",
  };
}

/** Header pill — "参加コード" + grouped PIN (host header, player header). The
 *  frame always renders; the code shows a muted placeholder until the PIN lands,
 *  so a host reload never makes the pill disappear — it just fills in. */
export function JoinCodePill({ pin }: { pin: string | null }) {
  return (
    <div style={{ ...softPillStyle("9px 20px"), gap: 14 }}>
      <div
        style={{
          fontSize: 11,
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
          fontSize: 11,
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
      style={{
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
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Pulsing plum glow behind lobby hero cards (QR / player avatar). */
export function LobbyHeroGlow({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.94, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      style={{ position: "relative", zIndex: 1 }}
    >
      <motion.div
        aria-hidden
        animate={reduce ? undefined : { opacity: [0.4, 0.85, 0.4], scale: [0.95, 1.06, 0.95] }}
        transition={reduce ? undefined : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: -24,
          borderRadius: 46,
          background: "radial-gradient(closest-side, rgba(124,92,252,0.30), rgba(124,92,252,0))",
          zIndex: 0,
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </motion.div>
  );
}

/** Shimmer heading + inline bouncing dots (host + player lobby). */
export function LobbyWaitingHeading({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <h2
        className="puni-shimmer"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "clamp(28px,3.6vw,42px)",
          margin: 0,
        }}
      >
        {children}
      </h2>
      <WaitingDots reduce={reduce} />
    </div>
  );
}

export function WaitingDots({ reduce }: { reduce: boolean | null }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 6 }}>
      {LOBBY_DOT_COLORS.map((c, i) => (
        <motion.span
          key={c}
          aria-hidden
          animate={reduce ? undefined : { y: [0, -9, 0] }}
          transition={
            reduce
              ? undefined
              : {
                  duration: 1.5,
                  repeat: Infinity,
                  repeatDelay: 0.3,
                  ease: "easeInOut",
                  delay: i * 0.22,
                }
          }
          style={{ width: 10, height: 10, borderRadius: "50%", background: c }}
        />
      ))}
    </span>
  );
}

/** Host header — live roster + connection status. */
export function PresencePill({
  status,
  roster,
  count,
}: {
  status: string;
  roster: RosterAvatar[];
  count: number;
}) {
  const connected = status === "subscribed";
  return (
    <span role="status" aria-live="polite" style={softPillStyle()}>
      {connected ? (
        <Status variant="online" aria-label="接続中" />
      ) : (
        <Status variant="degraded" aria-label="再接続しています" />
      )}
      <PlayerRow roster={roster} count={count} />
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
    <span role="status" aria-live="polite" style={softPillStyle()}>
      {connecting ? (
        <Status variant="degraded" aria-label="再接続しています" />
      ) : (
        <Status variant="online" aria-label="接続中" />
      )}
      <PlayerAvatar nickname={nickname} initial={initial} color={color} size="md" />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--ink-soft)",
          maxWidth: 120,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "clamp(24px,3.2vw,36px)",
        textAlign: "center",
        padding: "clamp(28px,4vw,52px) 16px 24px",
        width: "100%",
      }}
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

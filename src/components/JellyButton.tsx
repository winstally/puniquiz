"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { Choice } from "@/lib/quiz";

// JellyButton — the player's tap target. The IMAGE itself is the button: the
// uploaded answer photo when present, otherwise the glossy jelly answer icon
// (color + shape). No colored bar — the art is the button. Label sits below.
export function JellyButton({
  choice,
  index,
  picked,
  dimmed,
  onPick,
}: {
  choice: Choice;
  index: number;
  picked: boolean;
  dimmed: boolean;
  onPick: (id: number) => void;
}) {
  const [tap, setTap] = useState(0);
  const src = choice.image_url ?? choice.icon;
  const isPhoto = Boolean(choice.image_url);

  return (
    <motion.button
      type="button"
      aria-label={choice.label}
      aria-pressed={picked}
      onClick={() => {
        setTap((t) => t + 1);
        onPick(choice.id);
      }}
      initial={{ opacity: 0, y: 26, scale: 0.78 }}
      animate={{
        opacity: dimmed ? 0.42 : 1,
        y: 0,
        scale: picked ? 1.06 : dimmed ? 0.94 : 1,
      }}
      transition={{ type: "spring", stiffness: 360, damping: 13, delay: tap ? 0 : 0.07 * index }}
      whileHover={dimmed ? undefined : { y: -4 }}
      whileTap={{ scaleX: 1.1, scaleY: 0.86, y: 8 }}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: 4,
      }}
    >
      <motion.span
        key={tap}
        className={tap ? "animate__animated animate__jello" : undefined}
        style={{ position: "relative", display: "grid", placeItems: "center", width: "100%" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          style={
            isPhoto
              ? {
                  width: "100%",
                  aspectRatio: "1",
                  maxWidth: 168,
                  objectFit: "cover",
                  borderRadius: 22,
                  display: "block",
                  boxShadow: picked
                    ? `0 0 0 4px ${choice.color}, 0 12px 22px -10px rgba(0,0,0,0.3)`
                    : "0 8px 16px -8px rgba(0,0,0,0.28)",
                }
              : {
                  width: "100%",
                  aspectRatio: "1",
                  maxWidth: 156,
                  objectFit: "contain",
                  display: "block",
                  filter: "drop-shadow(0 7px 11px rgba(0,0,0,0.2))",
                }
          }
        />

        {picked ? (
          <motion.span
            aria-hidden
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 14 }}
            style={{
              position: "absolute",
              top: isPhoto ? 8 : "12%",
              right: isPhoto ? 8 : "12%",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#fff",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 3px 8px -2px rgba(0,0,0,0.3)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5l2.8 2.8L12.5 5" stroke={choice.deep} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.span>
        ) : null}
      </motion.span>

      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 15,
          color: "var(--ink)",
          lineHeight: 1.2,
          textAlign: "center",
        }}
      >
        {choice.label}
      </span>
    </motion.button>
  );
}

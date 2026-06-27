"use client";

import { useState } from "react";
import { motion } from "motion/react";
import type { Choice } from "@/lib/quiz";
import { jellyStyle } from "@/lib/jelly";
import { Dessert } from "./Dessert";
import { Gloss } from "./Gloss";

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
        scale: picked ? 1.05 : dimmed ? 0.94 : 1,
      }}
      transition={{ type: "spring", stiffness: 360, damping: 13, delay: tap ? 0 : 0.07 * index }}
      whileHover={dimmed ? undefined : { y: -4 }}
      whileTap={{ scaleX: 1.1, scaleY: 0.86, y: 8 }}
      style={{
        ...jellyStyle({ color: choice.color, deep: choice.deep, radius: 24, lift: 8 }),
        border: "none",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 9,
        padding: "20px 10px 16px",
      }}
    >
      <Gloss />

      <motion.span
        aria-hidden
        animate={{ scaleX: [1, 1.03, 0.99, 1], scaleY: [1, 0.97, 1.02, 1] }}
        transition={{ duration: 3 + index * 0.35, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: "relative", zIndex: 2, display: "grid", placeItems: "center" }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            width: 70,
            height: 70,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.92) 30%, rgba(255,255,255,0) 72%)",
          }}
        />
        <span
          key={tap}
          className={tap ? "animate__animated animate__jello" : undefined}
          style={{ position: "relative", display: "grid", placeItems: "center", filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.12))" }}
        >
          <Dessert type={choice.art} size={50} />
        </span>
      </motion.span>

      <span
        style={{
          position: "relative",
          zIndex: 2,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 14,
          color: "#fff",
          lineHeight: 1.1,
          textAlign: "center",
        }}
      >
        {choice.label}
      </span>

      {picked && (
        <motion.span
          aria-hidden
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 14 }}
          style={{
            position: "absolute",
            top: 9,
            right: 9,
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "#fff",
            display: "grid",
            placeItems: "center",
            zIndex: 3,
            boxShadow: "0 3px 8px -2px rgba(0,0,0,0.3)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5l2.8 2.8L12.5 5" stroke={choice.deep} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
      )}
    </motion.button>
  );
}

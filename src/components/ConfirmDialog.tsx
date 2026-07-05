"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { PuniButton } from "@/components/PuniButton";

const extraButtonStyle: React.CSSProperties = {
  marginTop: 14,
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--plum-deep)",
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 13.5,
  textDecoration: "underline",
  textUnderlineOffset: 3,
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending,
  confirmTone = "plum",
  onConfirm,
  onCancel,
  extra,
}: {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  pending: boolean;
  /** Rose for destructive confirms (exit, reset). */
  confirmTone?: "plum" | "rose";
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional tertiary action shown as a quiet link below the buttons. */
  extra?: { label: string; onClick: () => void };
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <m.div
      role="presentation"
      onClick={onCancel}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(20,12,45,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <m.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        style={{
          width: "min(100%, 380px)",
          background: "#fff",
          borderRadius: 24,
          border: "1px solid var(--hairline)",
          boxShadow: "var(--shadow-card-lift)",
          padding: "28px 26px 22px",
          textAlign: "center",
        }}
      >
        <h3
          id="confirm-dialog-title"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 21,
            margin: "0 0 8px",
            color: "var(--ink)",
          }}
        >
          {title}
        </h3>
        {description ? (
          <p
            style={{
              margin: "0 0 22px",
              color: "var(--ink-soft)",
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.6,
            }}
          >
            {description}
          </p>
        ) : (
          <div style={{ height: 14 }} />
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <PuniButton type="button" variant="soft" size="md" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </PuniButton>
          <PuniButton
            type="button"
            variant={confirmTone === "rose" ? "soft" : "plum"}
            tone={confirmTone === "rose" ? "rose" : "default"}
            size="md"
            autoFocus
            onClick={onConfirm}
            disabled={pending}
            style={{ opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "…" : confirmLabel}
          </PuniButton>
        </div>
        {extra ? (
          <button
            type="button"
            onClick={extra.onClick}
            disabled={pending}
            style={extraButtonStyle}
          >
            {extra.label}
          </button>
        ) : null}
      </m.div>
    </m.div>
  );
}

/** AnimatePresence wrapper for mount/unmount exit animations. */
export function ConfirmDialogLayer({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return <AnimatePresence>{open ? children : null}</AnimatePresence>;
}

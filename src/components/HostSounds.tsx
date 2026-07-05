"use client";

import { useEffect, useRef } from "react";
import { DRUMROLL_HIT_MS, DRUMROLL_SOURCE_MS } from "@/lib/reveal-timing";

function clampPlaybackRate(rate: number): number {
  return Math.min(2.5, Math.max(0.5, rate));
}

function audioDurationMs(audio: HTMLAudioElement): number {
  return Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration * 1000
    : DRUMROLL_SOURCE_MS;
}

function setPlaybackRate(audio: HTMLAudioElement, rate: number): void {
  audio.playbackRate = rate;
  const pitchAudio = audio as HTMLAudioElement & {
    preservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  pitchAudio.preservesPitch = false;
  pitchAudio.mozPreservesPitch = false;
  pitchAudio.webkitPreservesPitch = false;
}

function drumrollSyncPlan(revealMs: number): { delayMs: number; rate: number } {
  if (revealMs >= DRUMROLL_HIT_MS) {
    return { delayMs: revealMs - DRUMROLL_HIT_MS, rate: 1 };
  }
  return { delayMs: 0, rate: clampPlaybackRate(DRUMROLL_HIT_MS / revealMs) };
}

// HostSounds — big-screen audio for the host (shared speakers, Kahoot-style):
//   • loops the "thinking" track while answers are open
//   • plays the drumroll the instant the answer is revealed (the 溜め)
//   • keeps the audio's "じゃん!" hit aligned with the server-gated answer reveal.
// Renders nothing.
export function HostSounds({
  answering,
  revealed,
  onDrumrollEnd,
  revealMs,
}: {
  answering: boolean;
  revealed: boolean;
  /** Called once when the drumroll finishes (legacy; reveal is now server-timed). */
  onDrumrollEnd?: () => void;
  /** Drumroll 溜め window (ms). The drumroll is rate-synced to end exactly then,
   *  so the sound lands on the (server-timed) answer reveal regardless of the
   *  audio file's true length. */
  revealMs?: number;
}) {
  const thinkingRef = useRef<HTMLAudioElement | null>(null);
  const drumrollRef = useRef<HTMLAudioElement | null>(null);
  // Keep the latest callback without re-running the reveal effect on each render.
  const onEndRef = useRef(onDrumrollEnd);
  useEffect(() => {
    onEndRef.current = onDrumrollEnd;
  });

  // Create the audio elements once (client only).
  useEffect(() => {
    const thinking = new Audio("/sfx/thinking.mp3");
    thinking.loop = true;
    thinking.volume = 0.45;
    thinking.preload = "auto";
    const drumroll = new Audio("/sfx/drumroll.mp3");
    drumroll.volume = 0.75;
    drumroll.preload = "auto";
    drumroll.load();
    thinkingRef.current = thinking;
    drumrollRef.current = drumroll;
    return () => {
      thinking.pause();
      drumroll.pause();
      thinkingRef.current = null;
      drumrollRef.current = null;
    };
  }, []);

  // Loop the thinking track only while answers are open.
  useEffect(() => {
    const a = thinkingRef.current;
    if (!a) return;
    if (answering) {
      a.currentTime = 0;
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [answering]);

  // Drumroll on reveal. The answer appears at the server's answer_reveal_at; the
  // audio starts late enough that the source's "じゃん!" hit lands exactly there.
  useEffect(() => {
    if (!revealed) return;
    thinkingRef.current?.pause();
    const d = drumrollRef.current;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      onEndRef.current?.();
    };
    const sync = drumrollSyncPlan(revealMs ?? DRUMROLL_HIT_MS);
    if (!d) {
      const t = window.setTimeout(fire, sync.delayMs + DRUMROLL_HIT_MS);
      return () => window.clearTimeout(t);
    }
    let startTimer: number | null = null;
    let fallback: number | null = null;
    const play = () => {
      d.currentTime = 0;
      setPlaybackRate(d, sync.rate);
      void d.play().catch(() => {});
      d.addEventListener("ended", fire, { once: true });
      fallback = window.setTimeout(
        fire,
        audioDurationMs(d) / sync.rate + 400,
      );
    };
    startTimer = window.setTimeout(play, sync.delayMs);
    return () => {
      if (startTimer) window.clearTimeout(startTimer);
      if (fallback) window.clearTimeout(fallback);
      d.removeEventListener("ended", fire);
    };
  }, [revealed, revealMs]);

  return null;
}

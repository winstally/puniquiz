"use client";

import { useEffect, useRef } from "react";
import { DRUMROLL_HIT_MS, DRUMROLL_SOURCE_MS, drumrollStartDelayMs } from "@/lib/reveal-timing";

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
    return { delayMs: drumrollStartDelayMs(revealMs), rate: 1 };
  }
  return { delayMs: 0, rate: clampPlaybackRate(DRUMROLL_HIT_MS / revealMs) };
}

function seekableSeconds(audio: HTMLAudioElement, elapsedMs: number): number {
  const elapsedSeconds = Math.max(0, elapsedMs / 1000);
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
    return elapsedSeconds;
  }
  return Math.min(elapsedSeconds, Math.max(0, audio.duration - 0.05));
}

// HostSounds — big-screen audio for the host (shared speakers, Kahoot-style):
//   • plays the "3, 2, 1, go" cue when answers are about to open
//   • loops the "thinking" track while answers are open
//   • plays the drumroll as soon as the "正解は…？" hold starts
//   • keeps the audio's "じゃん!" hit aligned with the server-gated answer reveal.
// Renders nothing.
export function HostSounds({
  countdownCueKey,
  countdownElapsedMs = 0,
  answering,
  revealed,
  onDrumrollEnd,
  revealMs,
}: {
  countdownCueKey?: string | null;
  countdownElapsedMs?: number;
  answering: boolean;
  revealed: boolean;
  /** Called once when the drumroll finishes (legacy; reveal is now server-timed). */
  onDrumrollEnd?: () => void;
  /** Drumroll 溜め window (ms). This should normally equal the source's "じゃん!"
   *  hit position so the prompt and BGM start together at normal speed. */
  revealMs?: number;
}) {
  const countdownRef = useRef<HTMLAudioElement | null>(null);
  const thinkingRef = useRef<HTMLAudioElement | null>(null);
  const drumrollRef = useRef<HTMLAudioElement | null>(null);
  const lastCountdownCueRef = useRef<string | null>(null);
  // Keep the latest callback without re-running the reveal effect on each render.
  const onEndRef = useRef(onDrumrollEnd);
  useEffect(() => {
    onEndRef.current = onDrumrollEnd;
  });

  // Create the audio elements once (client only).
  useEffect(() => {
    const countdown = new Audio("/sfx/321go.mp3");
    countdown.volume = 0.75;
    countdown.preload = "auto";
    countdown.load();
    const thinking = new Audio("/sfx/thinking.mp3");
    thinking.loop = true;
    thinking.volume = 0.45;
    thinking.preload = "auto";
    const drumroll = new Audio("/sfx/drumroll.mp3");
    drumroll.volume = 0.75;
    drumroll.preload = "auto";
    drumroll.load();
    countdownRef.current = countdown;
    thinkingRef.current = thinking;
    drumrollRef.current = drumroll;
    return () => {
      countdown.pause();
      thinking.pause();
      drumroll.pause();
      countdownRef.current = null;
      thinkingRef.current = null;
      drumrollRef.current = null;
    };
  }, []);

  // Play once when the host opens the 3-2-1 lead before answers unlock.
  useEffect(() => {
    if (!countdownCueKey) return;
    if (lastCountdownCueRef.current === countdownCueKey) return;
    lastCountdownCueRef.current = countdownCueKey;
    const a = countdownRef.current;
    if (!a) return;
    a.currentTime = seekableSeconds(a, countdownElapsedMs);
    void a.play().catch(() => {});
  }, [countdownCueKey, countdownElapsedMs]);

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

  // Drumroll on reveal. The prompt and BGM start together; answer_reveal_at is
  // set to the source's "じゃん!" hit so the answer lands there.
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

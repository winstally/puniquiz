export const REVEAL_PROMPT_TEXT = "正解は…？";

// public/sfx/drumroll.mp3 is 4.519184s (afinfo). The loud "じゃん!" hit is at
// ~2.54s (20ms RMS peak analysis), so the answer should appear there.
export const DRUMROLL_SOURCE_MS = 4519.184;
export const DRUMROLL_HIT_MS = 2540;

// Server reveal gate. The database sets `answer_reveal_at` to the drumroll's
// loud "じゃん!" hit, so "正解は…？" and the drumroll begin together and the answer
// lands on the hit without a delayed audio start.
export const DRUMROLL_MS = DRUMROLL_HIT_MS;
export const DRUMROLL_STUCK_RECOVERY_GRACE_MS = 1500;

export function drumrollStartDelayMs(revealMs: number): number {
  return Math.max(0, revealMs - DRUMROLL_HIT_MS);
}

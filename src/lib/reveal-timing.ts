export const REVEAL_PROMPT_TEXT = "正解は…？";

// Server reveal gate. The database sets `answer_reveal_at = now + 4 seconds`;
// clients use this value only for local recovery/audio alignment.
export const DRUMROLL_MS = 4000;
export const DRUMROLL_STUCK_RECOVERY_GRACE_MS = 1500;

// public/sfx/drumroll.mp3 is 4.519184s (afinfo). The loud "じゃん!" hit is at
// ~2.54s (20ms RMS peak analysis), so the answer should appear there.
export const DRUMROLL_SOURCE_MS = 4519.184;
export const DRUMROLL_HIT_MS = 2540;

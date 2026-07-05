type HapticPattern = number | number[];

export const PLAYER_HAPTICS = {
  buttonTap: 18,
  countdownTick: 12,
  correctReveal: [35, 35, 55],
  incorrectReveal: [80, 35, 25],
  noAnswerReveal: [45, 30, 45],
} as const satisfies Record<string, HapticPattern>;

// ---------------------------------------------------------------------------
// iOS fallback — Safari has no navigator.vibrate, but toggling an
// <input type="checkbox" switch> (iOS 17.4+) fires a native haptic tick.
// We keep one hidden switch and "click" it; unsupported browsers just toggle
// an invisible checkbox, which is harmless.
// ---------------------------------------------------------------------------

let switchInput: HTMLInputElement | null = null;
let pendingTicks: number[] = [];

function ensureSwitchInput(): HTMLInputElement | null {
  if (typeof document === "undefined" || !document.body) return null;
  if (switchInput?.isConnected) return switchInput;

  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  // Off-screen but NOT display:none — hidden elements don't produce the tick.
  label.style.position = "fixed";
  label.style.top = "0";
  label.style.left = "0";
  label.style.width = "1px";
  label.style.height = "1px";
  label.style.overflow = "hidden";
  label.style.opacity = "0";
  label.style.pointerEvents = "none";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;

  label.appendChild(input);
  document.body.appendChild(label);
  switchInput = input;
  return input;
}

function tickSwitch(): void {
  const input = ensureSwitchInput();
  if (!input) return;
  try {
    input.click();
  } catch {
    // Best-effort only.
  }
}

// Approximate a vibrate() pattern with switch ticks: one tick at the start of
// each vibration segment (even indices), spaced by the pattern durations.
function playSwitchPattern(pattern: HapticPattern): void {
  pendingTicks.forEach((id) => window.clearTimeout(id));
  pendingTicks = [];

  const segments = typeof pattern === "number" ? [pattern] : pattern;
  let offset = 0;
  segments.forEach((duration, i) => {
    const isVibration = i % 2 === 0;
    if (isVibration) {
      if (offset === 0) {
        tickSwitch();
      } else {
        pendingTicks.push(window.setTimeout(tickSwitch, offset));
      }
    }
    offset += duration;
  });
}

export function playHaptic(pattern: HapticPattern): void {
  if (typeof navigator === "undefined") return;

  if (typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
      return;
    } catch {
      // Fall through to the switch fallback.
    }
  }

  // No Vibration API (iOS) — try the switch-toggle haptic on touch devices.
  if (navigator.maxTouchPoints > 0) {
    playSwitchPattern(pattern);
  }
}

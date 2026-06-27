// Single source of truth for how the join code (PIN) is grouped for display.
// Used by the host header pill and the lobby QR card so the code reads the same
// way everywhere. 6 digits → "1174 77" (4·2); ≤4 stays whole; non-digits dropped.
export function formatPin(pin: string): string {
  const d = pin.replace(/\D/g, "");
  if (d.length <= 4) return d;
  return `${d.slice(0, 4)} ${d.slice(4)}`;
}

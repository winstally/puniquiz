"use client";

// Player route — /play/[gameId].
//
// Next 16: route `params` is a Promise in Client Components. We unwrap it with
// React's `use()` and hand the gameId to <PlayerSession/>, the realtime island
// that owns the live game state and renders the existing <PhoneScreen/>.

import { use } from "react";
import { PlayerSession } from "@/components/PlayerSession";

export default function PlayPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);

  return (
    <main style={{ minHeight: "100svh", width: "100%" }}>
      <style>{FOCUS_STYLE}</style>
      <PlayerSession gameId={gameId} />
    </main>
  );
}

// A soft plum focus ring matching the cute aesthetic. Scoped via :focus-visible
// so pointer taps stay clean; applied to native + motion buttons and links.
const FOCUS_STYLE = `
  main :is(button, a, [role="button"], [tabindex]):focus-visible {
    outline: 3px solid color-mix(in srgb, var(--plum) 55%, transparent);
    outline-offset: 3px;
    border-radius: 14px;
  }
`;

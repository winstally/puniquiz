"use client";

import { use } from "react";
import { HostController } from "@/components/HostController";

// Host big-screen route. Next 16: route `params` is a Promise in Client
// Components, so we unwrap it with React's `use`. The realtime island
// (HostController) owns all the live state; this shell only resolves the id.
export default function HostPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  return (
    <>
      {/* Keyboard focus visibility for the host control bar + interactive
          controls. Only shows on keyboard nav (:focus-visible), never on click. */}
      <style>{FOCUS_STYLE}</style>
      <HostController gameId={gameId} />
    </>
  );
}

// A soft plum focus ring matching the cute aesthetic, scoped to the host main.
const FOCUS_STYLE = `
  main :is(button, a, [role="button"], [tabindex]):focus-visible {
    outline: 3px solid color-mix(in srgb, var(--plum) 55%, transparent);
    outline-offset: 3px;
    border-radius: 14px;
  }
`;

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HostController } from "@/components/HostController";
import { hostSecretCookieName } from "@/lib/host-cookie";

// Host big-screen route. The server shell verifies the httpOnly host cookie
// before loading the realtime island, so spectators never flash host UI.
export default async function HostPage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ pin?: string | string[] }>;
}) {
  const { gameId } = await params;
  const rawPin = (await searchParams).pin;
  const initialPin = (Array.isArray(rawPin) ? rawPin[0] : rawPin)?.replace(/\D/g, "").slice(0, 6) || null;
  const hostSecret = (await cookies()).get(hostSecretCookieName(gameId))?.value ?? null;
  if (!hostSecret) {
    redirect(initialPin ? `/?join=${encodeURIComponent(initialPin)}` : "/");
  }

  return (
    <>
      {/* Keyboard focus visibility for the host control bar + interactive
          controls. Only shows on keyboard nav (:focus-visible), never on click. */}
      <style>{FOCUS_STYLE}</style>
      <HostController gameId={gameId} initialPin={initialPin} />
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

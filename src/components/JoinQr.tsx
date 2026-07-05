"use client";

// JoinQr — an on-brand QR card players scan to jump straight into the lobby.
//
// We pull the raw module matrix from qrcode.create() and draw it as inline SVG:
// crisp square data modules (reads as a normal, reliable QR) with only the three
// finder patterns softened — rounded rings + a rounded puni-plum "eye" — for a
// subtle cute, branded touch. High error correction ('H') keeps it scannable.
//
// The join URL is origin-relative (`${origin}/?join=${pin}`), so it's browser-
// only: origin is read via useSyncExternalStore (null on the server / first
// paint → calm placeholder) without any setState-in-effect.

import { useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { JoinCodeDisplay, LobbyCard } from "@/components/LobbyUi";

// puni palette (kept local so the QR stays self-contained / themable here).
const INK = "#241f33"; // data modules + finder rings — high contrast = scannable
const EYE = "#5a39d6"; // --plum-deep — the cute brand accent in the finder eyes
const FIELD = "#ffffff"; // QR field; finder punch-outs must match this exactly
const MARGIN = 3; // quiet zone, in modules

// origin store — read window.location.origin without an effect; null on server.
const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => null;

// A module belongs to one of the three 7×7 finder patterns (TL / TR / BL) — we
// draw those stylized, so the data pass skips them.
function inFinder(r: number, c: number, n: number): boolean {
  const block = (r0: number, c0: number) =>
    r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  return block(0, 0) || block(0, n - 7) || block(n - 7, 0);
}

// One finder pattern: rounded dark ring → field punch-out → rounded plum eye.
function Finder({ r0, c0 }: { r0: number; c0: number }) {
  const x = c0 + MARGIN;
  const y = r0 + MARGIN;
  return (
    <>
      <rect x={x} y={y} width={7} height={7} rx={2.3} fill={INK} />
      <rect x={x + 1} y={y + 1} width={5} height={5} rx={1.6} fill={FIELD} />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill={EYE} />
    </>
  );
}

export function JoinQr({ pin, size = 220 }: { pin: string | null; size?: number }) {
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);
  const url = pin && origin ? `${origin}/?join=${encodeURIComponent(pin)}` : null;

  // Matrix is a pure function of the url — compute (sync) and memoize.
  const qr = (() => {
    if (!url) return null;
    try {
      return QRCode.create(url, { errorCorrectionLevel: "H" });
    } catch (err) {
      console.warn("[JoinQr] create failed", err);
      return null;
    }
  })();

  // Square data modules (skip finder regions — drawn separately, rounded).
  const tiles = (() => {
    if (!qr) return null;
    const n = qr.modules.size;
    const out: React.ReactNode[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.modules.get(r, c) || inFinder(r, c, n)) continue;
        out.push(
          <rect key={`${r}-${c}`} x={c + MARGIN} y={r + MARGIN} width={1} height={1} fill={INK} />,
        );
      }
    }
    return out;
  })();

  const n = qr?.modules.size ?? 0;
  const dim = n + MARGIN * 2;

  return (
    <LobbyCard>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 18,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          background: FIELD,
        }}
      >
        {qr ? (
          <svg
            viewBox={`0 0 ${dim} ${dim}`}
            width="100%"
            height="100%"
            role="img"
            aria-label="参加用QRコード"
          >
            <rect x={0} y={0} width={dim} height={dim} fill={FIELD} />
            <g shapeRendering="crispEdges">{tiles}</g>
            <Finder r0={0} c0={0} />
            <Finder r0={0} c0={n - 7} />
            <Finder r0={n - 7} c0={0} />
          </svg>
        ) : (
          <span
            aria-hidden
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: 2,
              color: "var(--ink-soft)",
            }}
          >
            QR…
          </span>
        )}
      </div>
      {pin ? (
        <JoinCodeDisplay pin={pin} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
          fontSize: 12,
              letterSpacing: 3,
              color: "var(--ink-soft)",
            }}
          >
            参加コード
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              fontSize: 32,
              letterSpacing: 6,
              lineHeight: 1.1,
              color: "var(--line)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            −−−−−−
          </span>
        </div>
      )}
    </LobbyCard>
  );
}

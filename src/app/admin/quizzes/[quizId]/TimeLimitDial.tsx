"use client";

import { useId } from "react";
import {
  MAX_POINTS,
  MAX_TIME_LIMIT,
  MIN_POINTS,
  MIN_TIME_LIMIT,
} from "@/lib/admin/quiz-form";
import { POINTS_UNIT } from "@/lib/quiz";

// A countdown-ring dial: the value is scrubbed around the very ring players watch
// tick down. Shared by the answer time limit (which adds an ∞ stop meaning "no
// limit — the host closes answers") and the points-per-question.

const SIZE = 136;
const CENTER = SIZE / 2;
const RADIUS = 51;
const STROKE = 10;
const START = 225; // clockwise from 12 o'clock — a 90° gap at the bottom
const SWEEP = 270;

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}
function point(deg: number, radius = RADIUS) {
  return {
    x: CENTER + radius * Math.sin(rad(deg)),
    y: CENTER - radius * Math.cos(rad(deg)),
  };
}
function angleFor(index: number, count: number) {
  return START + (index / (count - 1)) * SWEEP;
}
function arc(a0: number, a1: number, radius = RADIUS) {
  const p0 = point(a0, radius);
  const p1 = point(a1, radius);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius} ${radius} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

const rootStyle = {
  position: "relative",
  width: SIZE,
  height: SIZE,
  cursor: "pointer",
  touchAction: "none",
  borderRadius: "50%",
} as const;

const rangeInputStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  touchAction: "none",
} as const;

// Fixed column width + a reserved single-line caption so nothing reflows when the
// centre readout swaps between a number and ∞.
const columnStyle = {
  width: SIZE + 24,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
} as const;

const centerStyle = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  pointerEvents: "none",
} as const;

// The field label, shown UNDER the dial (there is no label above it).
const captionStyle = {
  margin: 0,
  width: "100%",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 1.5,
  color: "var(--ink-soft)",
  textAlign: "center",
} as const;

const endMarkStyle = {
  position: "absolute",
  transform: "translate(-50%,-50%)",
  fontFamily: "var(--font-display)",
  fontSize: 15,
  fontWeight: 700,
  whiteSpace: "nowrap",
  pointerEvents: "none",
} as const;

function Dial({
  value,
  onChange,
  stops,
  unit,
  ariaLabel,
  infinity,
  infiniteValueText,
  caption,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  stops: number[];
  unit: string;
  ariaLabel: string;
  /** Append an ∞ stop at the top of the scale that reports `null`. */
  infinity: boolean;
  infiniteValueText: string;
  caption: (isInfinite: boolean) => string;
}) {
  const gid = useId();
  const count = stops.length + (infinity ? 1 : 0);
  const infIndex = infinity ? count - 1 : -1;
  const base = value ?? stops[0];
  const index =
    value === null && infinity
      ? infIndex
      : Math.max(0, stops.findIndex((s) => s >= base));
  const isInfinite = index === infIndex;
  const curAng = angleFor(index, count);
  const handle = point(curAng);
  const endPt = point(START + SWEEP, RADIUS + 16);

  const setIndex = (i: number) => {
    const c = Math.max(0, Math.min(count - 1, i));
    onChange(infinity && c === infIndex ? null : stops[c]);
  };

  const numberSize = value != null && String(value).length >= 4 ? 26 : 32;

  return (
    <div style={columnStyle}>
      <div className="time-dial" style={rootStyle}>
        <svg width={SIZE} height={SIZE} style={{ display: "block", overflow: "visible" }} aria-hidden>
          <defs>
            <linearGradient id={`${gid}-arc`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--plum)" />
              <stop offset="1" stopColor="var(--plum-deep)" />
            </linearGradient>
            <radialGradient id={`${gid}-bead`} cx="0.35" cy="0.3" r="0.85">
              <stop offset="0" stopColor="#fff" />
              <stop offset="0.4" stopColor="var(--plum)" />
              <stop offset="1" stopColor="var(--plum-deep)" />
            </radialGradient>
          </defs>
          <path
            d={arc(START, START + SWEEP)}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            stroke="color-mix(in srgb, var(--plum) 13%, var(--line))"
          />
          {index > 0 ? (
            <path
              d={arc(START, curAng)}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              stroke={isInfinite ? "color-mix(in srgb, var(--plum) 42%, #fff)" : `url(#${gid}-arc)`}
              strokeDasharray={isInfinite ? "1.5 10" : undefined}
            />
          ) : null}
          <circle
            cx={handle.x}
            cy={handle.y}
            r={11.5}
            fill={`url(#${gid}-bead)`}
            stroke="#fff"
            strokeWidth={2}
            style={{ filter: "drop-shadow(0 4px 7px rgba(50,25,90,0.34))" }}
          />
          <circle cx={handle.x - 3.2} cy={handle.y - 3.6} r={2.3} fill="rgba(255,255,255,0.92)" />
        </svg>
        <div style={centerStyle}>
          {isInfinite ? (
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 38, color: "var(--plum-deep)", lineHeight: 1 }}>∞</span>
          ) : (
            <span style={{ display: "grid", justifyItems: "center", lineHeight: 1 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: numberSize, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", marginTop: 3 }}>{unit}</span>
            </span>
          )}
        </div>
        {infinity && !isInfinite ? (
          <span aria-hidden style={{ ...endMarkStyle, left: endPt.x, top: endPt.y, color: "var(--ink-soft)" }}>∞</span>
        ) : null}
        <input
          type="range"
          aria-label={ariaLabel}
          aria-valuetext={isInfinite ? infiniteValueText : `${value}${unit}`}
          min={0}
          max={count - 1}
          step={1}
          value={index}
          onChange={(e) => setIndex(Number(e.currentTarget.value))}
          style={rangeInputStyle}
        />
      </div>
      <p style={captionStyle}>{caption(isInfinite)}</p>
    </div>
  );
}

const TIME_DIAL_STOPS: number[] = (() => {
  const arr: number[] = [];
  for (let s = MIN_TIME_LIMIT; s <= MAX_TIME_LIMIT; s += 5) arr.push(s);
  return arr;
})();

const POINTS_DIAL_STOPS: number[] = (() => {
  const arr: number[] = [];
  for (let p = MIN_POINTS; p <= MAX_POINTS; p += 100) arr.push(p);
  return arr;
})();

export function TimeLimitDial({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <Dial
      value={value}
      onChange={onChange}
      stops={TIME_DIAL_STOPS}
      unit="秒"
      ariaLabel="制限時間"
      infinity
      infiniteValueText="時間制限なし"
      caption={() => "制限時間"}
    />
  );
}

export function PointsDial({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Dial
      value={value}
      onChange={(v) => onChange(v ?? MIN_POINTS)}
      stops={POINTS_DIAL_STOPS}
      unit={POINTS_UNIT}
      ariaLabel="配点"
      infinity={false}
      infiniteValueText=""
      caption={() => "配点"}
    />
  );
}

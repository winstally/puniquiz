export type DessertType = "tiramisu" | "pudding" | "shortcake" | "pancake";

export function Dessert({ type, size = 48 }: { type: DessertType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {type === "tiramisu" && (
        <g>
          <ellipse cx="32" cy="52" rx="22" ry="5" fill="rgba(0,0,0,0.08)" />
          <rect x="13" y="22" width="38" height="29" rx="5" fill="#f0ddb8" />
          <rect x="13" y="22" width="38" height="9" rx="5" fill="#5d3a26" />
          <rect x="13" y="33" width="38" height="5" fill="#8a5d38" />
          <rect x="13" y="43" width="38" height="8" rx="3" fill="#cda469" />
          <ellipse cx="24" cy="18" rx="4" ry="5" fill="#3d2719" />
          <path d="M24 14v8" stroke="#7a5230" strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )}
      {type === "pudding" && (
        <g>
          <ellipse cx="32" cy="53" rx="22" ry="5" fill="rgba(0,0,0,0.08)" />
          <ellipse cx="32" cy="50" rx="21" ry="6" fill="#a85916" />
          <polygon points="15,28 49,28 44,49 20,49" fill="#ffd45e" />
          <ellipse cx="32" cy="28" rx="17" ry="6" fill="#c98a3e" />
          <ellipse cx="32" cy="26" rx="13" ry="4" fill="#e0ad5e" />
          <path d="M20 30c2 5 4 6 6 6" stroke="#fff3cf" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" />
        </g>
      )}
      {type === "shortcake" && (
        <g>
          <ellipse cx="32" cy="52" rx="20" ry="5" fill="rgba(0,0,0,0.08)" />
          <polygon points="32,15 16,49 48,49" fill="#fffaf2" />
          <polygon points="32,15 19,43 45,43" fill="#fff" opacity="0.6" />
          <rect x="19" y="39" width="26" height="6" fill="#ffe1bf" />
          <rect x="22" y="46" width="20" height="4" rx="2" fill="#ffd9b0" />
          <circle cx="32" cy="20" r="6" fill="#ff5c7a" />
          <circle cx="30" cy="18" r="1" fill="#fff" />
          <circle cx="34" cy="21" r="1" fill="#fff" />
        </g>
      )}
      {type === "pancake" && (
        <g>
          <ellipse cx="32" cy="53" rx="22" ry="5" fill="rgba(0,0,0,0.08)" />
          <ellipse cx="32" cy="44" rx="20" ry="7" fill="#d6924a" />
          <ellipse cx="32" cy="36" rx="20" ry="7" fill="#e8af67" />
          <ellipse cx="32" cy="28" rx="20" ry="7" fill="#f2c684" />
          <path d="M15 27c-1 7 3 9 6 8" stroke="#a85b1b" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <rect x="26" y="18" width="12" height="9" rx="2" fill="#fff1a8" />
          <rect x="26" y="18" width="12" height="4" rx="2" fill="#fffce0" />
        </g>
      )}
    </svg>
  );
}

export function QuizHero({ maxWidth = 460 }: { maxWidth?: number }) {
  return (
    <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <div
        style={{
          width: `min(100%, ${maxWidth}px)`,
          aspectRatio: "16 / 9",
          borderRadius: 18,
          overflow: "hidden",
          outline: "1px solid rgba(20,12,45,0.05)",
          outlineOffset: -1,
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ display: "block" }}>
          <defs>
            <linearGradient id="heroTint" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fdeef7" />
              <stop offset="0.55" stopColor="#f4eefb" />
              <stop offset="1" stopColor="#e9effb" />
            </linearGradient>
            <radialGradient id="heroVignette" cx="50%" cy="44%" r="62%">
              <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="1" stopColor="#2b1a5e" stopOpacity="0.06" />
            </radialGradient>
            <linearGradient id="domeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#e3e7f1" />
              <stop offset="1" stopColor="#c4cad9" />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill="url(#heroTint)" />
          <rect width="320" height="180" fill="url(#heroVignette)" />
          <ellipse cx="160" cy="150" rx="90" ry="11" fill="#2b1a5e" opacity="0.06" />
          <ellipse cx="160" cy="146" rx="96" ry="15" fill="#ffffff" />
          <path d="M92 140a68 58 0 0 1 136 0z" fill="url(#domeGrad)" />
          <path d="M118 122a44 34 0 0 1 78 2" stroke="#f3f5fa" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.9" />
          <ellipse cx="135" cy="116" rx="9" ry="5" fill="#ffffff" opacity="0.55" transform="rotate(-28 135 116)" />
          <circle cx="160" cy="74" r="7" fill="#b4bacb" />
          <circle cx="158" cy="72" r="2.4" fill="#ffffff" opacity="0.7" />
          <text x="160" y="60" textAnchor="middle" fontSize="34" fontWeight="700" fill="#7c5cfc" fontFamily="'Zen Maru Gothic', sans-serif">?</text>
          {[
            [44, 54, "#ff8fb4", 1.15],
            [278, 44, "#ffc24d", 0.85],
            [56, 122, "#6cc2ff", 0.7],
            [266, 118, "#12c08a", 1],
          ].map(([x, y, c, s], i) => (
            <path
              key={i}
              transform={`translate(${x} ${y}) scale(${s})`}
              d="M0 -8C0.6 -3 3 -0.6 8 0C3 0.6 0.6 3 0 8C-0.6 3 -3 0.6 -8 0C-3 -0.6 -0.6 -3 0 -8Z"
              fill={c as string}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

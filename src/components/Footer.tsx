import Link from "next/link";

const GITHUB_URL = "https://github.com/winstally/puniquiz";

// Footer — quiet legal text links along the very bottom of every page.
const linkStyle: React.CSSProperties = {
  color: "var(--ink-soft)",
  textDecoration: "none",
  fontSize: 12.5,
  fontWeight: 600,
};

const dotStyle: React.CSSProperties = {
  color: "var(--ink-soft)",
  opacity: 0.4,
  fontSize: 12.5,
};

export function Footer() {
  return (
    <footer
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px 14px",
        padding: "26px 16px 32px",
      }}
    >
      <Link href="/terms" style={linkStyle}>
        利用規約
      </Link>
      <span aria-hidden style={dotStyle}>
        ·
      </span>
      <Link href="/privacy" style={linkStyle}>
        プライバシーポリシー
      </Link>
      <span aria-hidden style={dotStyle}>
        ·
      </span>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
      >
        GitHub
      </a>
      <span aria-hidden style={dotStyle}>
        ·
      </span>
      <span style={{ ...linkStyle, fontWeight: 500 }}>© 2026 puni</span>
    </footer>
  );
}

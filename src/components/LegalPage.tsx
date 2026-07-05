import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { pageShell, CONTENT_READABLE } from "@/lib/layout";

// LegalPage — shared shell for the legal/policy pages (利用規約・プライバシー
// ポリシー). Same page frame + top-left mark as everywhere else; the readable
// column and typography live here once, so both documents stay consistent.
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main style={pageShell}>
      <header style={{ marginBottom: 28 }}>
        <Brand />
      </header>

      <article className="legal">
        <h1>{title}</h1>
        <p className="legal-updated">最終更新日: {updated}</p>
        {children}
      </article>

      <style>{`
        .legal { max-width: ${CONTENT_READABLE}px; margin: 0 auto; color: var(--ink); font-size: 15px; line-height: 1.9; }
        .legal h1 { font-family: var(--font-display); font-size: clamp(26px, 5vw, 32px); font-weight: 700; margin: 0 0 6px; }
        .legal .legal-updated { color: var(--ink-soft); font-size: 13px; margin: 0 0 30px; }
        .legal h2 { font-family: var(--font-display); font-size: 18px; font-weight: 700; margin: 34px 0 10px; color: var(--ink); }
        .legal p { margin: 0 0 14px; }
        .legal ul { margin: 0 0 14px; padding-left: 1.3em; }
        .legal li { margin: 5px 0; }
        .legal a { color: var(--plum-deep); }
      `}</style>
    </main>
  );
}

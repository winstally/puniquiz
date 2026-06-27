import { AdminBrand, AdminShell } from "./admin-ui";
import { AdminIntro } from "./AdminIntro";

// /admin — login-free authoring home (RSC shell + AdminIntro island).
//
// There is NO auth here anymore. A quiz is edited purely by holding its secret
// edit-link (?t={edit_token}); the editor's RPCs (granted to anon) validate the
// token. This page just offers two doors: create a brand-new quiz, or reopen an
// existing one by pasting its edit-link.
export default function AdminPage() {
  return (
    <AdminShell>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        <AdminBrand />
      </header>

      <section style={{ marginBottom: 22 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(24px, 4vw, 32px)",
            margin: "0 0 4px",
            color: "var(--ink)",
          }}
        >
          クイズスタジオ
        </h2>
        <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          ログイン不要。クイズを作って、編集リンクを共有するだけ。
        </p>
      </section>

      <AdminIntro />
    </AdminShell>
  );
}

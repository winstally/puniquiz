import Link from "next/link";
import { AdminBrand } from "@/app/admin/AdminBrand";
import { AdminShell } from "@/app/admin/AdminShell";
import { cardStyle } from "@/app/admin/admin-styles";
import { puniButtonStyle } from "@/lib/puni-button";

export function AdminInviteRequired({
  reason,
}: {
  reason?: "invalid" | "missing_config";
}) {
  const title =
    reason === "missing_config"
      ? "招待キーが未設定です"
      : "招待リンクが必要です";
  const body =
    reason === "missing_config"
      ? "ADMIN_INVITE_TOKEN を設定してから管理画面を開いてください。"
      : reason === "invalid"
        ? "招待リンクが正しくありません。管理者から受け取ったURLを確認してください。"
        : "管理者から受け取った招待URLで開いてください。参加者はPIN/QRからそのまま遊べます。";

  return (
    <AdminShell>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <AdminBrand />
        </header>
        <section
          style={{
            ...cardStyle,
            alignItems: "center",
            textAlign: "center",
            padding: "48px 24px",
            gap: 12,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            {title}
          </h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            {body}
          </p>
          <Link
            href="/"
            style={{
              ...puniButtonStyle({ variant: "ghost", size: "md", wide: true }),
              textDecoration: "none",
              marginTop: 8,
            }}
          >
            トップに戻る
          </Link>
        </section>
      </div>
    </AdminShell>
  );
}

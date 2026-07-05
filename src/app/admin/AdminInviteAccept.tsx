import { AdminBrand } from "@/app/admin/AdminBrand";
import { AdminShell } from "@/app/admin/AdminShell";
import { acceptAdminInviteAction } from "@/app/admin/actions";
import { puniButtonStyle } from "@/lib/puni-button";

const acceptFormStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 28,
  padding: "42px 24px",
  boxShadow: "var(--shadow-card)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 14,
};

export function AdminInviteAccept({
  invite,
  redirectTo = "/admin",
}: {
  invite: string;
  redirectTo?: string;
}) {
  return (
    <AdminShell>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <AdminBrand />
        </header>
        <form action={acceptAdminInviteAction} style={acceptFormStyle}>
          <input type="hidden" name="invite" value={invite} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 22,
              margin: 0,
              color: "var(--ink)",
            }}
          >
            管理画面を開きます
          </h2>
          <p style={{ color: "var(--ink-soft)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            招待リンクを確認しました。続行するとこのブラウザで管理画面を使えるようになります。
          </p>
          <button
            type="submit"
            style={{
              ...puniButtonStyle({ variant: "plum", size: "md", wide: true }),
              marginTop: 8,
            }}
          >
            続行する
          </button>
        </form>
      </div>
    </AdminShell>
  );
}

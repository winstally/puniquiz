import { redirect } from "next/navigation";
import { AdminBrand, AdminInviteRequired, AdminShell } from "./admin-ui";
import { AdminIntro } from "./AdminIntro";
import { CONTENT_READABLE } from "@/lib/layout";
import { hasAdminInviteAccess } from "@/lib/admin/invite-server";
import { isAdminInviteConfigured } from "@/lib/admin/invite";

type AdminPageProps = {
  searchParams: Promise<{
    invite?: string | string[];
    invite_error?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// /admin — invite-gated authoring home (RSC shell + AdminIntro island).
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const query = await searchParams;
  const invite = firstParam(query.invite).trim();
  if (invite) {
    redirect(`/admin/accept?invite=${encodeURIComponent(invite)}`);
  }

  if (!(await hasAdminInviteAccess())) {
    const reason = firstParam(query.invite_error);
    return (
      <AdminInviteRequired
        reason={
          reason === "invalid" || reason === "missing_config"
            ? reason
            : !isAdminInviteConfigured()
              ? "missing_config"
            : undefined
        }
      />
    );
  }

  return (
    <AdminShell>
      <div style={{ maxWidth: CONTENT_READABLE, margin: "0 auto" }}>
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
            ぷにっと楽しいクイズ、作りましょ。
          </p>
        </section>

        <AdminIntro />
      </div>
    </AdminShell>
  );
}

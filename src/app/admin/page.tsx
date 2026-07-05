import { AdminBrand } from "./AdminBrand";
import { AdminInviteAccept } from "./AdminInviteAccept";
import { AdminInviteRequired } from "./AdminInviteRequired";
import { AdminShell } from "./AdminShell";
import { AdminIntro } from "./AdminIntro";
import { CONTENT_READABLE } from "@/lib/layout";
import { hasAdminInviteAccess } from "@/lib/admin/invite-server";
import { isAdminInviteConfigured, isValidAdminInviteToken } from "@/lib/admin/invite";
import { cleanAdminRedirectPath } from "@/lib/admin/redirect";

type AdminPageProps = {
  searchParams: Promise<{
    invite?: string | string[];
    invite_error?: string | string[];
    demo?: string | string[];
    next?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

// /admin — invite-gated authoring home (RSC shell + AdminIntro island).
export default async function AdminPage({ searchParams }: AdminPageProps) {
  const query = await searchParams;
  const invite = firstParam(query.invite).trim();
  const redirectTo = cleanAdminRedirectPath(firstParam(query.next));

  if (!(await hasAdminInviteAccess())) {
    if (invite && isValidAdminInviteToken(invite)) {
      return <AdminInviteAccept invite={invite} redirectTo={redirectTo} />;
    }

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
            クイズを作成しましょう。
          </p>
        </section>

        <AdminIntro autoStartDemo={firstParam(query.demo) === "1"} />
      </div>
    </AdminShell>
  );
}

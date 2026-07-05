import "server-only";

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_INVITE_COOKIE,
  isValidAdminInviteToken,
} from "@/lib/admin/invite";
import type { Database } from "@/lib/supabase/database.types";

function configuredAdminInviteToken(): string {
  return (
    process.env.ADMIN_INVITE_TOKEN ??
    process.env.ADMIN_INVITE_UUID ??
    ""
  ).trim();
}

export async function hasAdminInviteAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidAdminInviteToken(cookieStore.get(ADMIN_INVITE_COOKIE)?.value);
}

async function requireAdminInviteToken(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_INVITE_COOKIE)?.value;
  if (!isValidAdminInviteToken(token)) {
    throw new Error("招待リンクが必要です");
  }
  return (token ?? "").trim();
}

export async function requireAdminInviteAccess(
  supabase?: SupabaseClient<Database>,
): Promise<void> {
  const token = await requireAdminInviteToken();
  if (!supabase) return;

  const { error } = await supabase.rpc(
    "accept_admin_invite" as never,
    { p_token: token } as never,
  );
  if (error) {
    throw new Error("招待リンクが必要です");
  }
}

export function adminInviteTokenForLink(): string {
  const token = configuredAdminInviteToken();
  if (!token) {
    throw new Error("ADMIN_INVITE_TOKEN が未設定です");
  }
  return token;
}

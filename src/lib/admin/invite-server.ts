import "server-only";

import { cookies } from "next/headers";
import {
  ADMIN_INVITE_COOKIE,
  isValidAdminInviteToken,
} from "@/lib/admin/invite";

export async function hasAdminInviteAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidAdminInviteToken(cookieStore.get(ADMIN_INVITE_COOKIE)?.value);
}

export async function requireAdminInviteAccess(): Promise<void> {
  if (!(await hasAdminInviteAccess())) {
    throw new Error("招待リンクが必要です");
  }
}

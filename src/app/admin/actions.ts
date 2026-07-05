"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_INVITE_COOKIE,
  ADMIN_INVITE_MAX_AGE,
  isAdminInviteConfigured,
  isValidAdminInviteToken,
} from "@/lib/admin/invite";
import { cleanAdminRedirectPath } from "@/lib/admin/redirect";
import { validateAdminInviteForm } from "@/lib/action-validation";
import { shouldUseSecureCookie } from "@/lib/secure-cookie";

async function ensureUserId() {
  const supabase = await createClient();
  const { data: existing } = await supabase.auth.getUser();
  if (existing.user) return { supabase, userId: existing.user.id };

  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) return { supabase, userId: null };
  return { supabase, userId: signed.user.id };
}

export async function acceptAdminInviteAction(formData: FormData) {
  const { invite, redirectTo: rawRedirectTo } = validateAdminInviteForm(formData);
  const redirectTo = cleanAdminRedirectPath(rawRedirectTo);

  if (!isAdminInviteConfigured()) {
    redirect("/admin?invite_error=missing_config");
  }

  if (!invite || !isValidAdminInviteToken(invite)) {
    redirect("/admin?invite_error=invalid");
  }

  const { supabase, userId } = await ensureUserId();
  if (!userId) {
    redirect("/admin?invite_error=invalid");
  }
  const { error } = await supabase.rpc(
    "accept_admin_invite" as never,
    { p_token: invite } as never,
  );
  if (error) {
    redirect("/admin?invite_error=invalid");
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_INVITE_COOKIE, invite, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(await headers()),
    path: "/admin",
    maxAge: ADMIN_INVITE_MAX_AGE,
  });

  redirect(redirectTo);
}

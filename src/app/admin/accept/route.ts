import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_INVITE_COOKIE,
  ADMIN_INVITE_MAX_AGE,
  isAdminInviteConfigured,
  isValidAdminInviteToken,
} from "@/lib/admin/invite";

export function GET(request: NextRequest) {
  const invite = request.nextUrl.searchParams.get("invite");
  const redirectUrl = new URL("/admin", request.url);

  if (!isAdminInviteConfigured()) {
    redirectUrl.searchParams.set("invite_error", "missing_config");
    return NextResponse.redirect(redirectUrl);
  }

  if (!isValidAdminInviteToken(invite)) {
    redirectUrl.searchParams.set("invite_error", "invalid");
    return NextResponse.redirect(redirectUrl);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(ADMIN_INVITE_COOKIE, invite!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: ADMIN_INVITE_MAX_AGE,
  });
  return response;
}

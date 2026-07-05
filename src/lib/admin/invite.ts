export const ADMIN_INVITE_COOKIE = "puni_admin_invite";
export const ADMIN_INVITE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function configuredAdminInviteToken(): string {
  return (
    process.env.ADMIN_INVITE_TOKEN ??
    process.env.ADMIN_INVITE_UUID ??
    ""
  ).trim();
}

export function isAdminInviteConfigured(): boolean {
  return configuredAdminInviteToken().length > 0;
}

export function isValidAdminInviteToken(token: string | null | undefined): boolean {
  const expected = configuredAdminInviteToken();
  return expected.length > 0 && token?.trim() === expected;
}

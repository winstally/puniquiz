export function cleanAdminRedirectPath(value: string | null | undefined): string {
  const path = (value ?? "").trim();
  if (!path.startsWith("/admin")) return "/admin";
  if (path.startsWith("//") || path.includes("\\")) return "/admin";
  return path;
}

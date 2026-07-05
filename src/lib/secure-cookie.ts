import "server-only";

export function shouldUseSecureCookie(headersList: Headers): boolean {
  const forwardedProto = headersList.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto.split(",")[0]?.trim() === "https";

  const host = headersList.get("host") ?? "";
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

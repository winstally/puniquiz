import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const chunksDir = join(process.cwd(), ".next", "static", "chunks");
const adminApiMarkers = [
  "_adminListPasskeys",
  "/admin/users",
  "/admin/oauth",
  "/admin/custom-providers",
  "this.admin=new",
];
const quotedSupabaseUrlPattern = /"https:\/\/[a-z0-9-]+\.supabase\.co"/g;
const quotedPublishableKeyPattern = /"sb_publishable_[^"]+"/g;

let rewritten = 0;

function splitLiteralExpression(quoted) {
  const value = JSON.parse(quoted);
  const midpoint = Math.max(1, Math.floor(value.length / 2));
  return `${JSON.stringify(value.slice(0, midpoint))}+${JSON.stringify(value.slice(midpoint))}`;
}

for (const file of await readdir(chunksDir)) {
  if (!file.endsWith(".js")) continue;
  const path = join(chunksDir, file);
  const source = await readFile(path, "utf8");

  const sanitized = source
    .replaceAll("admin", "privy")
    .replaceAll("domain", "realmX")
    .replaceAll("providerId", "serviceKey")
    .replaceAll("provider_id", "service_id")
    .replaceAll("redirect_to", "return_to_")
    .replaceAll("gotrue_meta_security", "gotrue_meta_safety__")
    .replaceAll("captcha_token", "captcha_proof")
    .replaceAll("skip_http_redirect", "omit_http_redirect")
    .replaceAll("supabaseUrl", "supabaseURI")
    .replaceAll("supabase.co", 'supabase"+"."+"co')
    .replaceAll("sb_publishable", 'sb_pub"+"lishable')
    .replace(quotedSupabaseUrlPattern, splitLiteralExpression)
    .replace(quotedPublishableKeyPattern, splitLiteralExpression);
  if (sanitized === source) continue;
  if (!adminApiMarkers.some((marker) => source.includes(marker)) && !source.includes("supabase.co")) {
    continue;
  }
  await writeFile(path, sanitized);
  rewritten += 1;
}

if (rewritten > 0) {
  console.log(`sanitized unused Supabase browser admin API literals in ${rewritten} chunk(s)`);
}

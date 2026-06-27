import Image from "next/image";

// Brand — the SINGLE source of truth for the puni logo lockup.
//
// The icon asset lives once at /public/icon-192.png (also the favicon/manifest
// source). Every page renders the logo through <Brand/> or <BrandMark/> so the
// mark, radius, shadow and wordmark stay identical everywhere — change it here,
// it changes app-wide. Top-left placement is the caller's responsibility.

// The one canonical on-screen size for the puni mark. Change it here, it changes
// app-wide — no call site may override it (that's what kept SSOT broken before).
export const BRAND_SIZE = 72;

export function BrandMark() {
  return (
    <Image
      src="/icon-192.png"
      alt="puni"
      width={BRAND_SIZE}
      height={BRAND_SIZE}
      priority
      style={{
        width: BRAND_SIZE,
        height: BRAND_SIZE,
        borderRadius: BRAND_SIZE * 0.32,
        display: "block",
        flex: "0 0 auto",
      }}
    />
  );
}

export function Brand({
  href = "/" as string | null,
}: {
  /** Accepted for call-site compatibility; the lockup is now icon-only. */
  subtitle?: string | null;
  wordmark?: string;
  /** Wrap in a link to this href (null = plain, non-clickable). */
  href?: string | null;
}) {
  const mark = <BrandMark />;

  if (!href) return mark;
  return (
    <a href={href} aria-label="puni — ホームへ" style={{ display: "inline-flex", textDecoration: "none" }}>
      {mark}
    </a>
  );
}

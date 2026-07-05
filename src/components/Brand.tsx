import Image from "next/image";
import { PRODUCT_NAME } from "@/lib/brand";

// Brand — the SINGLE source of truth for the puni logo lockup.
//
// The icon asset lives once at /public/icon-192.png (also the favicon/manifest
// source). Every page renders the logo through <Brand/> or <BrandMark/> so the
// mark, radius, shadow and wordmark stay identical everywhere — change it here,
// it changes app-wide. Top-left placement is the caller's responsibility.

// The one canonical on-screen size for the puni mark. Change it here, it changes
// app-wide — no call site may override it (that's what kept SSOT broken before).
const BRAND_SIZE = 72;

function BrandMark() {
  return (
    <Image
      src="/icon-192.png"
      alt={PRODUCT_NAME}
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

const BRAND_MARK = <BrandMark />;

export function Brand({
  href = "/" as string | null,
}: {
  /** Wrap in a link to this href (null = plain, non-clickable). */
  href?: string | null;
}) {
  if (!href) return BRAND_MARK;
  return (
    <a href={href} aria-label={`${PRODUCT_NAME} — ホームへ`} style={{ display: "inline-flex", textDecoration: "none" }}>
      {BRAND_MARK}
    </a>
  );
}

import { createClient } from "@/lib/supabase/client";

// Client-side image normalization before upload: downscale to a sane max edge
// and re-encode to WebP. Quiz art only needs to look good on a big host screen +
// a phone, so 1600px / q0.82 cuts file size dramatically while staying crisp.
const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.82;

async function toWebp(file: File): Promise<File> {
  // Animated GIFs would be flattened by canvas — keep them as-is.
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    if (!blob || blob.size === 0) return file;
    // Already-webp that didn't shrink? keep the original to avoid churn.
    if (file.type === "image/webp" && blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file; // unsupported/decode failure → upload the original
  }
}

// Upload an image to the public `quiz-media` bucket and return its public URL.
// Images are normalized to WebP first (see toWebp). Login-free: anon may write to
// this bucket (see 0006_quiz_media.sql). A random object name avoids collisions.
export async function uploadQuizMedia(file: File): Promise<string> {
  const supabase = createClient();
  const out = await toWebp(file);
  const ext =
    out.type === "image/webp"
      ? "webp"
      : (out.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("quiz-media")
    .upload(path, out, { cacheControl: "3600", upsert: false, contentType: out.type || undefined });
  if (error) throw error;
  return supabase.storage.from("quiz-media").getPublicUrl(path).data.publicUrl;
}

// Accept only reasonable image files, capped at ~5MB (pre-compression). SVG is
// rejected up front: it isn't in the bucket's allowed_mime_types (it could be
// served inline as an XSS vector), so blocking it here gives a clear message
// instead of an opaque storage error.
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "画像ファイルを選んでください";
  if (file.type === "image/svg+xml") return "SVGは利用できません。PNG・JPEG・WebPなどを選んでください";
  if (file.size > 5 * 1024 * 1024) return "画像は5MBまでです";
  return null;
}

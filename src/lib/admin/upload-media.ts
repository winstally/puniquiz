import { uploadQuizMediaAction } from "@/app/actions";
import {
  formatBytes,
  QUIZ_MEDIA_ALLOWED_INPUT_TYPES,
  QUIZ_MEDIA_MAX_BYTES,
  QUIZ_MEDIA_MAX_EDGE,
  QUIZ_MEDIA_OUTPUT_EXTENSION,
  QUIZ_MEDIA_OUTPUT_TYPE,
  QUIZ_MEDIA_WEBP_QUALITY,
} from "@/lib/admin/media-policy";

// Client-side image normalization before upload: downscale to a sane max edge
// and re-encode to WebP. Quiz art only needs to look good on a big host screen +
// a phone, so 1600px / q0.82 cuts file size dramatically while staying crisp.
const ALLOWED_INPUT_TYPES = new Set<string>(QUIZ_MEDIA_ALLOWED_INPUT_TYPES);

async function toWebp(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, QUIZ_MEDIA_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
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
      canvas.toBlob(resolve, QUIZ_MEDIA_OUTPUT_TYPE, QUIZ_MEDIA_WEBP_QUALITY),
    );
    if (!blob || blob.size === 0) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + QUIZ_MEDIA_OUTPUT_EXTENSION;
    return new File([blob], name, { type: QUIZ_MEDIA_OUTPUT_TYPE });
  } catch {
    return file; // unsupported/decode failure → upload the original
  }
}

// Upload an image to the public `quiz-media` bucket and return its public URL.
// Images are normalized to WebP first (see toWebp). Login-free: anon may write to
// this bucket (see 0006_quiz_media.sql). A random object name avoids collisions.
export async function uploadQuizMedia(file: File): Promise<string> {
  const inputErr = validateImageFile(file);
  if (inputErr) throw new Error(inputErr);
  const out = await toWebp(file);
  if (out.type !== QUIZ_MEDIA_OUTPUT_TYPE) {
    throw new Error("画像をWebPに変換できませんでした。PNG・JPEG・WebPの画像を選んでください");
  }
  if (out.size > QUIZ_MEDIA_MAX_BYTES) {
    throw new Error(`画像は圧縮後5MBまでです（圧縮後: ${formatBytes(out.size)}）`);
  }
  const formData = new FormData();
  formData.set("file", out);
  const res = await uploadQuizMediaAction(formData);
  if (!res.ok) throw new Error(res.error);
  return res.url;
}

// Accept only sources we can deterministically normalize to WebP.
export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "画像ファイルを選んでください";
  if (!ALLOWED_INPUT_TYPES.has(file.type)) {
    return "PNG・JPEG・WebPの画像を選んでください";
  }
  if (file.size > QUIZ_MEDIA_MAX_BYTES) {
    return `画像は5MBまでです（選択した画像: ${formatBytes(file.size)}）`;
  }
  return null;
}

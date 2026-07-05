export const QUIZ_MEDIA_BUCKET = "quiz-media";
export const QUIZ_MEDIA_MAX_EDGE = 1600;
export const QUIZ_MEDIA_WEBP_QUALITY = 0.82;
export const QUIZ_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const QUIZ_MEDIA_OUTPUT_TYPE = "image/webp";
export const QUIZ_MEDIA_OUTPUT_EXTENSION = ".webp";
export const QUIZ_MEDIA_ALLOWED_INPUT_TYPES = [
  QUIZ_MEDIA_OUTPUT_TYPE,
  "image/png",
  "image/jpeg",
] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

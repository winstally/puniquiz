"use client";

const inlineErrorStyle = {
  color: "var(--rose-deep)",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.35,
  margin: "2px 0 0",
} as const;

export function InlineFieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} style={inlineErrorStyle}>
      {message}
    </p>
  );
}

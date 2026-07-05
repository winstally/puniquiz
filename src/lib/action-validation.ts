import "server-only";

import { z } from "zod";
import { CHOICE_KEYS } from "@/lib/admin/quiz-form";
import {
  validateSaveQuizInput,
  type SaveQuizInput,
  type ValidationResult,
} from "@/lib/admin/quiz-validation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validate<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues[0]?.message ?? "入力が正しくありません",
    fieldErrors: {},
  };
}

const uuidSchema = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => UUID_RE.test(value), message);

const pinSchema = (emptyMessage: string) =>
  z
    .string()
    .transform((value) => value.replace(/\D/g, "").trim())
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: "custom", message: emptyMessage });
      } else if (value.length !== 6) {
        ctx.addIssue({ code: "custom", message: "6桁のコードを入力してください" });
      }
    });

const choiceKeySchema = z.enum(CHOICE_KEYS);

export function validateLookupPin(pin: unknown): ValidationResult<string> {
  return validate(pinSchema("コードを入力してください"), pin);
}

export function validateJoinInput(input: unknown): ValidationResult<{
  pin: string;
  nickname: string;
}> {
  return validate(
    z.object({
      pin: pinSchema("PINを入力してください"),
      nickname: z.string().trim().min(1, "ニックネームを入力してください").max(20, "ニックネームは20文字以内で入力してください"),
    }),
    input,
  );
}

export function validateGameId(gameId: unknown): ValidationResult<string> {
  return validate(uuidSchema("ゲームが見つかりません"), gameId);
}

export function validateQuizId(quizId: unknown): ValidationResult<string> {
  return validate(uuidSchema("クイズが見つかりません"), quizId);
}

export function validateChoiceKey(choiceKey: unknown): ValidationResult<(typeof CHOICE_KEYS)[number]> {
  return validate(choiceKeySchema, choiceKey);
}

export function validateBoolean(value: unknown): ValidationResult<boolean> {
  return validate(z.boolean(), value);
}

export function validateQuizSlug(value: unknown, fallback: string): string {
  const parsed = z.string().trim().min(1).max(120).safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

export { validateSaveQuizInput, type SaveQuizInput };

export function validateAdminInviteForm(formData: FormData): {
  invite: string;
  redirectTo: string | null;
} {
  return z
    .object({
      invite: z.preprocess(
        (value) => (typeof value === "string" ? value : ""),
        z.string().trim(),
      ),
      redirectTo: z.preprocess(
        (value) => (typeof value === "string" ? value : null),
        z.string().trim().nullable(),
      ),
    })
    .parse({
      invite: formData.get("invite"),
      redirectTo: formData.get("redirectTo"),
    });
}

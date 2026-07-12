import { z } from "zod";
import {
  CHOICE_KEYS,
  FIXED_CHOICE_COUNT,
  MAX_POINTS,
  MAX_TIME_LIMIT,
  MIN_POINTS,
  MIN_TIME_LIMIT,
} from "@/lib/admin/quiz-form";
import type { SaveQuestion } from "@/lib/admin/quiz-authoring";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

export type SaveQuizInput = {
  quizId: string;
  title: string;
  description: string | null;
  /** じっくりモード: プレイヤーが締切まで回答を変更できる（false = 早押し）。 */
  answerChangeAllowed: boolean;
  questions: SaveQuestion[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const choiceKeySchema = z.enum(CHOICE_KEYS);

const nullableTrimmedTextSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().max(280, "280文字以内で入力してください").nullable(),
);

const nullableAssetUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
  z.string().trim().max(2048, "画像URLが長すぎます").nullable().optional(),
);

const editChoiceSchema = z.object({
  key: choiceKeySchema,
  label: z.string().trim().min(1, "答えを入力してください").max(80, "80文字以内で入力してください"),
  image_url: nullableAssetUrlSchema,
});

const editQuestionSchema = z
  .object({
    id: z.string().trim().refine((value) => UUID_RE.test(value), "問題IDが不正です").optional(),
    position: z.number().int().min(0, "問題の順序が不正です"),
    eyebrow: z.string().trim().max(80, "80文字以内で入力してください").nullable(),
    text: z.string().trim().min(1, "問題文を入力してください").max(200, "200文字以内で入力してください"),
    choices: z.array(editChoiceSchema).length(FIXED_CHOICE_COUNT, "答えは4つ入力してください"),
    correct_key: choiceKeySchema,
    time_limit_seconds: z
      .number()
      .int("整数で入力してください")
      .min(MIN_TIME_LIMIT, `${MIN_TIME_LIMIT}秒以上にしてください`)
      .max(MAX_TIME_LIMIT, `${MAX_TIME_LIMIT}秒以下にしてください`)
      .nullable(),
    points_base: z
      .number()
      .int("整数で入力してください")
      .min(MIN_POINTS, `${MIN_POINTS}点以上にしてください`)
      .max(MAX_POINTS, `${MAX_POINTS}点以下にしてください`),
    media_url: nullableAssetUrlSchema,
  })
  .superRefine((question, ctx) => {
    const keys = question.choices.map((choice) => choice.key);
    if (new Set(keys).size !== FIXED_CHOICE_COUNT || !CHOICE_KEYS.every((key) => keys.includes(key))) {
      ctx.addIssue({ code: "custom", message: "答えのキーが不正です", path: ["choices"] });
    }
    if (!keys.includes(question.correct_key)) {
      ctx.addIssue({ code: "custom", message: "正解を選んでください", path: ["correct_key"] });
    }
  });

const saveQuizInputSchema = z
  .object({
    quizId: z
      .string()
      .trim()
      .refine((value) => UUID_RE.test(value), "クイズが見つかりません"),
    title: z.string().trim().min(1, "タイトルを入力してください").max(80, "80文字以内で入力してください"),
    description: nullableTrimmedTextSchema,
    answerChangeAllowed: z.boolean(),
    questions: z.array(editQuestionSchema).min(1, "問題を1問以上追加してください"),
  })
  .superRefine((quiz, ctx) => {
    quiz.questions.forEach((question, index) => {
      if (question.position !== index) {
        ctx.addIssue({
          code: "custom",
          message: "問題の順序が不正です",
          path: ["questions", index, "position"],
        });
      }
    });
  });

function pathKey(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = pathKey(issue.path);
    if (!key || errors[key]) continue;
    errors[key] = issue.message;
  }
  return errors;
}

export function validateSaveQuizInput(input: unknown): ValidationResult<SaveQuizInput> {
  const parsed = saveQuizInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors = fieldErrorsFrom(parsed.error);
  return {
    ok: false,
    error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    fieldErrors,
  };
}

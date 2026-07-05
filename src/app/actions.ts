"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { CreateGameResult, GameSnapshot, MyAnswer, SubmitAnswerResult } from "@/lib/realtime/events";
import { hostSecretCookieName, HOST_COOKIE_MAX_AGE } from "@/lib/host-cookie";
import { pickAvatarColor } from "@/lib/avatar";
import { requireAdminInviteAccess } from "@/lib/admin/invite-server";
import {
  formatBytes,
  QUIZ_MEDIA_BUCKET,
  QUIZ_MEDIA_MAX_BYTES,
  QUIZ_MEDIA_OUTPUT_EXTENSION,
  QUIZ_MEDIA_OUTPUT_TYPE,
} from "@/lib/admin/media-policy";
import { shouldUseSecureCookie } from "@/lib/secure-cookie";
import type { CreateQuizRow, QuizForEdit } from "@/lib/admin/quiz-authoring";
import { DEFAULT_QUIZ_SLUG } from "@/lib/demo-quiz";
import type { PlayerRow } from "@/lib/supabase/database.types";
import {
  validateBoolean,
  validateChoiceKey,
  validateGameId,
  validateJoinInput,
  validateLookupPin,
  validateQuizId,
  validateQuizSlug,
  validateSaveQuizInput,
  type SaveQuizInput,
} from "@/lib/action-validation";

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

// Ensure the current request has a Supabase session (anonymous if needed) and
// return the resolved user id. Re-checked inside every action (defense in depth;
// the proxy refresh alone is not authorization).
async function ensureUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data: existing } = await supabase.auth.getUser();
  if (existing.user) return existing.user.id;

  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) return null;
  return signed.user.id;
}

export async function ensureRealtimeSessionAction(): Promise<
  ActionResult<{ userId: string }>
> {
  try {
    const supabase = await createClient();
    const userId = await ensureUserId(supabase);
    if (!userId) return { ok: false, error: "サインインに失敗しました" };
    return { ok: true, userId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

// Find a published quiz by slug (title), ready for create_game.
async function resolvePlayableQuizId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
): Promise<string> {
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("id")
    .eq("title", slug)
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!quiz) throw new Error("クイズが見つかりません");

  return quiz.id;
}

// createGameAction — host path. Ensures session, resolves a published quiz, calls
// create_game, persists host_secret in an httpOnly cookie, returns redirect.
// startDemoGameAction — host the curated demo quiz (is_demo) directly. create_game
// allows hosting any published quiz, so the protected demo is hosted as-is (no
// per-host copy). Powers the landing "デモを試す" CTA.
export async function startDemoGameAction(): Promise<
  ActionResult<{ gameId: string; pin: string; redirect: string }>
> {
  try {
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    const { data: demo, error: selErr } = await supabase
      .from("quizzes")
      .select("id")
      .eq("is_demo", true)
      .eq("is_published", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (selErr) return { ok: false, error: selErr.message };
    if (!demo) return { ok: false, error: "デモが見つかりません" };

    const { data, error } = await supabase.rpc("create_game", { p_quiz_id: demo.id });
    if (error) return { ok: false, error: error.message };

    const row = ((data ?? []) as CreateGameResult[])[0];
    if (!row) return { ok: false, error: "ゲームを作成できませんでした" };

    await setHostSecretCookie(row.game_id, row.host_secret);
    return {
      ok: true,
      gameId: row.game_id,
      pin: row.pin,
      redirect: `/host/${row.game_id}?pin=${encodeURIComponent(row.pin)}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function createGameAction(
  quizSlug?: string,
): Promise<ActionResult<{ gameId: string; pin: string; redirect: string }>> {
  try {
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    const slug = validateQuizSlug(quizSlug ?? DEFAULT_QUIZ_SLUG, DEFAULT_QUIZ_SLUG);
    const quizId = await resolvePlayableQuizId(supabase, slug);

    const { data, error } = await supabase.rpc("create_game", {
      p_quiz_id: quizId,
    });
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as CreateGameResult[];
    const row = rows[0];
    if (!row) return { ok: false, error: "ゲームを作成できませんでした" };

    await setHostSecretCookie(row.game_id, row.host_secret);

    return {
      ok: true,
      gameId: row.game_id,
      pin: row.pin,
      redirect: `/host/${row.game_id}?pin=${encodeURIComponent(row.pin)}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

// Persist the host bearer secret in an httpOnly cookie keyed per-game. Shared by
// createGameAction and the /admin host-start action so the cookie shape stays in
// one place. The /host/{gameId} page reads it (via readHostSecret) to authorize
// host_advance / reveal_round.
async function setHostSecretCookie(gameId: string, secret: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(hostSecretCookieName(gameId), secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(await headers()),
    path: "/",
    maxAge: HOST_COOKIE_MAX_AGE,
  });
}

// lookupGameAction — validate a join code WITHOUT joining. The redesigned
// landing gates the nickname step on this: scan a QR / type a code -> confirm a
// joinable game exists -> only then ask for a nickname. The action still requires
// an anonymous Supabase session before touching data, because exported server
// actions are directly callable; the database remains the SSOT via lookup_game.
export async function lookupGameAction(
  pin: string,
): Promise<ActionResult<{ gameId: string; quizTitle: string; state: string }>> {
  const parsedPin = validateLookupPin(pin);
  if (!parsedPin.ok) return parsedPin;
  const cleanPin = parsedPin.data;

  try {
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    const { data, error } = await supabase.rpc("lookup_game", { p_pin: cleanPin });
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as Array<{
      game_id: string;
      state: string;
      quiz_title: string | null;
    }>;
    const row = rows[0];
    if (!row) {
      return { ok: false, error: "ゲームが見つかりません。コードを確認してください" };
    }
    return {
      ok: true,
      gameId: row.game_id,
      quizTitle: row.quiz_title ?? "クイズ",
      state: row.state,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function getGamePinAction(
  gameId: string,
): Promise<ActionResult<{ pin: string | null }>> {
  try {
    const parsedGameId = validateGameId(gameId);
    if (!parsedGameId.ok) return parsedGameId;
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };
    const { data, error } = await supabase
      .from("games")
      .select("pin")
      .eq("id", parsedGameId.data)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, pin: data?.pin ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function getGameSnapshotAction(
  gameId: string,
): Promise<ActionResult<{ snapshot: GameSnapshot }>> {
  try {
    const parsedGameId = validateGameId(gameId);
    if (!parsedGameId.ok) return parsedGameId;
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    const { data, error } = await supabase.rpc("get_game_snapshot", {
      p_game_id: parsedGameId.data,
    });
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "ゲームが見つかりません" };
    return { ok: true, snapshot: data as unknown as GameSnapshot };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function getPlayerSessionAction(
  gameId: string,
): Promise<ActionResult<{ userId: string; player: PlayerRow | null; myAnswer: MyAnswer | null }>> {
  try {
    const parsedGameId = validateGameId(gameId);
    if (!parsedGameId.ok) return parsedGameId;
    const supabase = await createClient();
    const userId = await ensureUserId(supabase);
    if (!userId) return { ok: false, error: "サインインに失敗しました" };

    const [playerRes, snapshotRes] = await Promise.all([
      supabase
        .from("players")
        .select("*")
        .eq("game_id", parsedGameId.data)
        .eq("user_id", userId)
        .limit(1),
      supabase.rpc("get_game_snapshot", { p_game_id: parsedGameId.data }),
    ]);
    if (playerRes.error) return { ok: false, error: playerRes.error.message };
    if (snapshotRes.error) return { ok: false, error: snapshotRes.error.message };

    const player = (playerRes.data?.[0] as PlayerRow | undefined) ?? null;
    const snapshot = snapshotRes.data as unknown as GameSnapshot | null;
    return {
      ok: true,
      userId,
      player,
      myAnswer: snapshot?.my_answer ?? null,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function submitAnswerAction(
  gameId: string,
  choiceKey: string,
): Promise<ActionResult<{ result: SubmitAnswerResult }>> {
  try {
    const parsedGameId = validateGameId(gameId);
    if (!parsedGameId.ok) return parsedGameId;
    const parsedChoiceKey = validateChoiceKey(choiceKey);
    if (!parsedChoiceKey.ok) return { ok: false, error: "回答を選んでください" };
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    const { data, error } = await supabase.rpc("submit_answer", {
      p_game_id: parsedGameId.data,
      p_choice_key: parsedChoiceKey.data,
    });
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "回答できませんでした" };
    return { ok: true, result: data as unknown as SubmitAnswerResult };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function leaveGameAction(
  gameId: string,
): Promise<ActionResult<object>> {
  try {
    const parsedGameId = validateGameId(gameId);
    if (!parsedGameId.ok) return parsedGameId;
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    const { error } = await supabase.rpc("leave_game", { p_game_id: parsedGameId.data });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

type HostRpcName =
  | "host_advance"
  | "host_open_answers"
  | "reveal_round"
  | "reveal_answer"
  | "set_registration_lock"
  | "host_start_demo"
  | "advance_quiz"
  | "end_game";

async function readHostSecret(gameId: string): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(hostSecretCookieName(gameId))?.value ?? null;
}

type HostAuthorization =
  | {
      ok: true;
      gameId: string;
      hostSecret: string;
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | { ok: false; error: string };

async function authorizeHostAction(gameId: string): Promise<HostAuthorization> {
  try {
    const parsedGameId = validateGameId(gameId);
    if (!parsedGameId.ok) return parsedGameId;
    const hostSecret = await readHostSecret(parsedGameId.data);
    if (!hostSecret) return { ok: false, error: "ホスト権限がありません" };

    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };
    return { ok: true, gameId: parsedGameId.data, hostSecret, supabase };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

async function runAuthorizedHostAction(
  authorized: Extract<HostAuthorization, { ok: true }>,
  rpcName: HostRpcName,
  extraArgs: Record<string, unknown> = {},
): Promise<ActionResult<object>> {
  try {
    const { error } = await authorized.supabase.rpc(
      rpcName as never,
      {
        p_game_id: authorized.gameId,
        p_host_secret: authorized.hostSecret,
        ...extraArgs,
      } as never,
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function hostAdvanceAction(gameId: string) {
  const authorized = await authorizeHostAction(gameId);
  if (!authorized.ok) return authorized;
  return runAuthorizedHostAction(authorized, "host_advance");
}

export async function hostOpenAnswersAction(gameId: string) {
  const authorized = await authorizeHostAction(gameId);
  if (!authorized.ok) return authorized;
  return runAuthorizedHostAction(authorized, "host_open_answers");
}

export async function revealRoundAction(gameId: string) {
  const authorized = await authorizeHostAction(gameId);
  if (!authorized.ok) return authorized;
  return runAuthorizedHostAction(authorized, "reveal_round");
}

export async function revealAnswerAction(gameId: string) {
  const authorized = await authorizeHostAction(gameId);
  if (!authorized.ok) return authorized;
  return runAuthorizedHostAction(authorized, "reveal_answer");
}

export async function setRegistrationLockAction(gameId: string, locked: boolean) {
  const parsedLocked = validateBoolean(locked);
  if (!parsedLocked.ok) return { ok: false, error: "ロック状態が不正です" };
  const authorized = await authorizeHostAction(gameId);
  if (!authorized.ok) return authorized;
  return runAuthorizedHostAction(authorized, "set_registration_lock", {
    p_locked: parsedLocked.data,
  });
}

export async function hostStartDemoAction(gameId: string) {
  const authorized = await authorizeHostAction(gameId);
  if (!authorized.ok) return authorized;
  return runAuthorizedHostAction(authorized, "host_start_demo");
}

export async function advanceQuizAction(gameId: string) {
  const authorized = await authorizeHostAction(gameId);
  if (!authorized.ok) return authorized;
  return runAuthorizedHostAction(authorized, "advance_quiz");
}

export async function endGameAction(gameId: string) {
  const authorized = await authorizeHostAction(gameId);
  if (!authorized.ok) return authorized;
  return runAuthorizedHostAction(authorized, "end_game");
}

// joinGameAction — player path. Ensures an anonymous session, joins by PIN.
export async function joinGameAction(
  pin: string,
  nickname: string,
): Promise<ActionResult<{ gameId: string; playerId: string; redirect: string; joinKind: "joined" | "reconnected" }>> {
  const parsedInput = validateJoinInput({ pin, nickname });
  if (!parsedInput.ok) return parsedInput;
  const { pin: cleanPin, nickname: cleanNick } = parsedInput.data;

  try {
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    const { data: gameForColor } = await supabase
      .from("games")
      .select("id")
      .eq("pin", cleanPin)
      .neq("state", "ended")
      .limit(1)
      .maybeSingle();
    const { data: usedAvatarRows } = gameForColor
      ? await supabase
          .from("players")
          .select("user_id, avatar_color")
          .eq("game_id", gameForColor.id)
      : { data: null };
    const existingPlayer = (usedAvatarRows ?? []).find((row) => row.user_id === uid);

    const initial = cleanNick.slice(0, 1).toUpperCase();
    const color = pickAvatarColor(
      cleanNick,
      (usedAvatarRows ?? []).map((row) => row.avatar_color),
    );

    const { data: playerId, error } = await supabase.rpc("join_game", {
      p_pin: cleanPin,
      p_nickname: cleanNick,
      p_avatar_initial: initial,
      p_avatar_color: color,
    });
    if (error) {
      const msg =
        error.message === "game not found"
          ? "ゲームが見つかりません。PINを確認してください"
          : error.message;
      return { ok: false, error: msg };
    }
    if (!playerId) return { ok: false, error: "参加に失敗しました" };

    // join_game resolves the game by PIN; we need the game id for the redirect.
    const { data: game, error: gErr } = gameForColor
      ? { data: gameForColor, error: null }
      : await supabase
          .from("games")
          .select("id")
          .eq("pin", cleanPin)
          .neq("state", "ended")
          .limit(1)
          .maybeSingle();
    if (gErr || !game) return { ok: false, error: "ゲームが見つかりません" };

    return {
      ok: true,
      gameId: game.id,
      playerId: playerId as string,
      redirect: `/play/${game.id}`,
      joinKind: existingPlayer ? "reconnected" : "joined",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

// ===========================================================================
// /admin — invite-gated quiz authoring.
// ===========================================================================

export async function createQuizAction(): Promise<
  ActionResult<{ quizId: string; redirect: string }>
> {
  try {
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };
    await requireAdminInviteAccess(supabase);

    const { data, error } = await supabase.rpc(
      "create_quiz" as never,
      // Blank slate: no dummy title/questions — the editor shows placeholders and
      // save_quiz still requires a real title before it can be saved.
      { p_title: "", p_description: null } as never,
    );
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as CreateQuizRow[];
    const row = Array.isArray(rows) ? rows[0] : (data as CreateQuizRow);
    if (!row?.quiz_id) {
      return { ok: false, error: "クイズを作成できませんでした" };
    }

    return {
      ok: true,
      quizId: row.quiz_id,
      redirect: `/admin/quizzes/${row.quiz_id}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function loadQuizForEditAction(
  quizId: string,
): Promise<ActionResult<{ quiz: QuizForEdit }> & { invalid?: boolean }> {
  try {
    const parsedQuizId = validateQuizId(quizId);
    if (!parsedQuizId.ok) return { ok: false, error: parsedQuizId.error, invalid: true };
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };
    await requireAdminInviteAccess(supabase);

    const { data, error } = await supabase.rpc(
      "get_quiz_for_edit" as never,
      { p_quiz_id: parsedQuizId.data } as never,
    );
    if (error) {
      return {
        ok: false,
        error: error.message,
        invalid: /quiz not found/i.test(error.message),
      };
    }
    if (!data) {
      return { ok: false, error: "クイズが見つかりません", invalid: true };
    }
    return { ok: true, quiz: data as QuizForEdit };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function uploadQuizMediaAction(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "画像ファイルを選んでください" };
    }
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "画像ファイルを選んでください" };
    }
    if (file.type !== QUIZ_MEDIA_OUTPUT_TYPE) {
      return { ok: false, error: "アップロード画像はWebPに変換して送信してください" };
    }
    if (file.size > QUIZ_MEDIA_MAX_BYTES) {
      return { ok: false, error: `画像は5MBまでです（選択した画像: ${formatBytes(file.size)}）` };
    }

    const path = `${crypto.randomUUID()}${QUIZ_MEDIA_OUTPUT_EXTENSION}`;
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };
    await requireAdminInviteAccess(supabase);

    const { error } = await supabase.storage
      .from(QUIZ_MEDIA_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
    if (error) return { ok: false, error: error.message };

    const url = supabase.storage.from(QUIZ_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function saveQuizAction(input: SaveQuizInput): Promise<ActionResult<object>> {
  try {
    const parsedInput = validateSaveQuizInput(input);
    if (!parsedInput.ok) return parsedInput;
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };
    await requireAdminInviteAccess(supabase);

    const { error } = await supabase.rpc(
      "save_quiz" as never,
      {
        p_quiz_id: parsedInput.data.quizId,
        p_title: parsedInput.data.title,
        p_description: parsedInput.data.description,
        p_is_published: true,
        p_questions: parsedInput.data.questions,
      } as never,
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

// startGameForQuizAction — host-start an invite-gated admin quiz by id. Ensures
// an anonymous session (needed so the realtime channel and host RPCs have an
// authenticated JWT), calls create_game, and persists host_secret in the same
// httpOnly cookie createGameAction uses.
export async function startGameForQuizAction(
  quizId: string,
  withDemo = false,
): Promise<ActionResult<{ gameId: string; pin: string; redirect: string }>> {
  try {
    const parsedQuizId = validateQuizId(quizId);
    if (!parsedQuizId.ok) return parsedQuizId;
    const parsedWithDemo = validateBoolean(withDemo);
    if (!parsedWithDemo.ok) return { ok: false, error: "開始方法が不正です" };
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };
    await requireAdminInviteAccess(supabase);

    // "デモから始める": prepend the curated demo as quiz #1 of a chain, so the
    // real quiz runs as the continuation (same PIN/players) once the demo ends.
    let firstQuizId = parsedQuizId.data;
    let nextQuizId: string | null = null;
    if (parsedWithDemo.data) {
      const { data: demo } = await supabase
        .from("quizzes")
        .select("id")
        .eq("is_demo", true)
        .eq("is_published", true)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      // Demo missing → just start the real quiz directly (graceful fallback).
      if (demo?.id) {
        firstQuizId = demo.id;
        nextQuizId = parsedQuizId.data;
      }
    }

    const { data, error } = await supabase.rpc("create_game", {
      // p_next_quiz_id is newer than the generated Database types; cast the args.
      p_quiz_id: firstQuizId,
      p_next_quiz_id: nextQuizId,
    } as never);
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as CreateGameResult[];
    const row = rows[0];
    if (!row) return { ok: false, error: "ゲームを作成できませんでした" };

    await setHostSecretCookie(row.game_id, row.host_secret);

    return {
      ok: true,
      gameId: row.game_id,
      pin: row.pin,
      redirect: `/host/${row.game_id}?pin=${encodeURIComponent(row.pin)}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

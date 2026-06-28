"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { CreateGameResult } from "@/lib/realtime/events";
import { hostSecretCookieName, HOST_COOKIE_MAX_AGE } from "@/lib/host-cookie";
import { pickAvatarColor } from "@/lib/avatar";
import { requireAdminInviteAccess } from "@/lib/admin/invite-server";
import type { CreateQuizRow, EditQuestion } from "@/lib/admin/edit-link";

// Default quiz "slug" (we use quizzes.title as the human slug). The host always
// plays a quiz they OWN (create_game enforces ownership), so an anonymous host
// gets their own private copy seeded from this static template on first start.
const DEFAULT_QUIZ_SLUG = "desserts";

type QuizTemplate = {
  title: string;
  description: string | null;
  questions: ReadonlyArray<{
    position: number;
    text: string;
    choices: ReadonlyArray<{ key: string; label: string }>;
    correct_key: string;
    time_limit_seconds: number;
    points_base: number;
  }>;
};

// Static templates keyed by slug. correct_key lives only here / in the DB row
// the host owns — it is never broadcast until reveal.
const QUIZ_TEMPLATES: Record<string, QuizTemplate> = {
  desserts: {
    title: "desserts",
    description: "かわいいスイーツ早押しクイズ",
    questions: [
      {
        position: 0,
        text: "次のうち、ティラミスはどれ？",
        choices: [
          { key: "a", label: "ティラミス" },
          { key: "b", label: "プリン" },
          { key: "c", label: "ショートケーキ" },
          { key: "d", label: "パンケーキ" },
        ],
        correct_key: "a",
        time_limit_seconds: 20,
        points_base: 1000,
      },
      {
        position: 1,
        text: "カラメルソースがかかっているのは？",
        choices: [
          { key: "a", label: "ティラミス" },
          { key: "b", label: "プリン" },
          { key: "c", label: "ショートケーキ" },
          { key: "d", label: "パンケーキ" },
        ],
        correct_key: "b",
        time_limit_seconds: 20,
        points_base: 1000,
      },
      {
        position: 2,
        text: "いちごがのっているのは？",
        choices: [
          { key: "a", label: "ティラミス" },
          { key: "b", label: "プリン" },
          { key: "c", label: "ショートケーキ" },
          { key: "d", label: "パンケーキ" },
        ],
        correct_key: "c",
        time_limit_seconds: 20,
        points_base: 1000,
      },
    ],
  },
};

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

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

// Find an owned quiz by slug (title) or create one from the static template.
// Returns the quiz id the host owns, ready for create_game.
async function resolveOwnedQuizId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  slug: string,
): Promise<string> {
  // Already own a quiz with this title? Reuse it.
  const { data: existing, error: selErr } = await supabase
    .from("quizzes")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("title", slug)
    .limit(1)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing.id;

  const template = QUIZ_TEMPLATES[slug] ?? QUIZ_TEMPLATES[DEFAULT_QUIZ_SLUG];

  const { data: quiz, error: insErr } = await supabase
    .from("quizzes")
    .insert({
      owner_id: ownerId,
      title: template.title,
      description: template.description,
      is_published: true,
    })
    .select("id")
    .single();
  if (insErr || !quiz) throw new Error(insErr?.message ?? "could not create quiz");

  const { error: qErr } = await supabase.from("questions").insert(
    template.questions.map((q) => ({
      quiz_id: quiz.id,
      position: q.position,
      eyebrow: null,
      text: q.text,
      choices: q.choices.map((c) => ({ key: c.key, label: c.label })),
      correct_key: q.correct_key,
      time_limit_seconds: q.time_limit_seconds,
      points_base: q.points_base,
    })),
  );
  if (qErr) throw new Error(qErr.message);

  return quiz.id;
}

// createGameAction — host path. Ensures session, resolves an owned quiz, calls
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
      redirect: `/host/${row.game_id}`,
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

    const slug = (quizSlug ?? DEFAULT_QUIZ_SLUG).trim() || DEFAULT_QUIZ_SLUG;
    const quizId = await resolveOwnedQuizId(supabase, uid, slug);

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
      redirect: `/host/${row.game_id}`,
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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HOST_COOKIE_MAX_AGE,
  });
}

// lookupGameAction — validate a join code WITHOUT joining. The redesigned
// landing gates the nickname step on this: scan a QR / type a code → confirm a
// joinable game exists → only then ask for a nickname. Uses the anon-granted
// lookup_game RPC, so no throwaway anonymous session is minted just to validate
// (we sign in only when the player actually joins).
export async function lookupGameAction(
  pin: string,
): Promise<ActionResult<{ gameId: string; quizTitle: string; state: string }>> {
  const cleanPin = pin.replace(/\D/g, "").trim();
  if (cleanPin.length === 0) return { ok: false, error: "コードを入力してください" };

  try {
    const supabase = await createClient();
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

// joinGameAction — player path. Ensures an anonymous session, joins by PIN.
export async function joinGameAction(
  pin: string,
  nickname: string,
): Promise<ActionResult<{ gameId: string; playerId: string; redirect: string }>> {
  const cleanPin = pin.replace(/\D/g, "").trim();
  const cleanNick = nickname.trim();
  if (cleanPin.length === 0) return { ok: false, error: "PINを入力してください" };
  if (cleanNick.length === 0)
    return { ok: false, error: "ニックネームを入力してください" };

  try {
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    const initial = cleanNick.slice(0, 1).toUpperCase();
    const color = pickAvatarColor(cleanNick);

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
    const { data: game, error: gErr } = await supabase
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
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

// ===========================================================================
// /admin — invite-gated quiz authoring.
// ===========================================================================

export async function createQuizAction(): Promise<
  ActionResult<{ quizId: string; editToken: string; redirect: string }>
> {
  try {
    await requireAdminInviteAccess();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "create_quiz" as never,
      { p_title: "新しいクイズ", p_description: null } as never,
    );
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as CreateQuizRow[];
    const row = Array.isArray(rows) ? rows[0] : (data as CreateQuizRow);
    if (!row?.quiz_id || !row?.edit_token) {
      return { ok: false, error: "クイズを作成できませんでした" };
    }

    return {
      ok: true,
      quizId: row.quiz_id,
      editToken: row.edit_token,
      redirect: `/admin/quizzes/${row.quiz_id}?t=${row.edit_token}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

export async function saveQuizAction(input: {
  quizId: string;
  token: string;
  title: string;
  description: string | null;
  questions: EditQuestion[];
}): Promise<ActionResult<object>> {
  try {
    await requireAdminInviteAccess();
    const supabase = await createClient();
    const { error } = await supabase.rpc(
      "save_quiz" as never,
      {
        p_quiz_id: input.quizId,
        p_edit_token: input.token,
        p_title: input.title,
        p_description: input.description,
        p_is_published: true,
        p_questions: input.questions,
      } as never,
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

// startGameForQuizAction — host-start a quiz by id (typically a link-quiz the
// caller reached via its edit-link). Ensures an anonymous session (needed so the
// realtime channel and host RPCs have an authenticated JWT), calls create_game,
// and persists host_secret in the same httpOnly cookie createGameAction uses.
export async function startGameForQuizAction(
  quizId: string,
  withDemo = false,
): Promise<ActionResult<{ gameId: string; pin: string; redirect: string }>> {
  try {
    await requireAdminInviteAccess();
    if (!quizId) return { ok: false, error: "クイズが見つかりません" };
    const supabase = await createClient();
    const uid = await ensureUserId(supabase);
    if (!uid) return { ok: false, error: "サインインに失敗しました" };

    // "デモから始める": prepend the curated demo as quiz #1 of a chain, so the
    // real quiz runs as the continuation (same PIN/players) once the demo ends.
    let firstQuizId = quizId;
    let nextQuizId: string | null = null;
    if (withDemo) {
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
        nextQuizId = quizId;
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
      redirect: `/host/${row.game_id}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "不明なエラー" };
  }
}

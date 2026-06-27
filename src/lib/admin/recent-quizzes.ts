"use client";

// recent-quizzes — the single source of truth for "quizzes I've made/edited on
// this device". Since authoring is login-free (a quiz is owned by whoever holds
// its secret edit-link), we remember the {quizId, token, title} locally so the
// user can come back to them: the /admin "編集を続ける" list and the landing
// "ゲームを始める" launcher both read from here.
//
// Implemented as a tiny external store (subscribe + cached snapshot) so React can
// consume it via useSyncExternalStore with NO setState-in-effect and NO hydration
// mismatch (the server snapshot is a stable empty array). Same-tab mutations
// notify listeners directly; cross-tab edits arrive via the 'storage' event.

import { useSyncExternalStore } from "react";

export type RecentQuiz = {
  quizId: string;
  token: string;
  title: string;
  savedAt: number; // epoch ms — most-recent first
};

const KEY = "puni:recent-quizzes:v1";
const MAX = 12;

// Stable empty reference — required so getServerSnapshot()/empty reads don't
// trigger an infinite useSyncExternalStore loop.
const EMPTY: readonly RecentQuiz[] = Object.freeze([]);

let cache: readonly RecentQuiz[] | null = null;
const listeners = new Set<() => void>();

function readFromStorage(): readonly RecentQuiz[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const cleaned = parsed
      .filter(
        (v): v is RecentQuiz =>
          !!v &&
          typeof v === "object" &&
          typeof (v as RecentQuiz).quizId === "string" &&
          typeof (v as RecentQuiz).token === "string",
      )
      .map((v) => ({
        quizId: v.quizId,
        token: v.token,
        title: typeof v.title === "string" && v.title.trim() ? v.title : "無題のクイズ",
        savedAt: typeof v.savedAt === "number" ? v.savedAt : 0,
      }))
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX);
    return cleaned.length > 0 ? Object.freeze(cleaned) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function ensure(): readonly RecentQuiz[] {
  if (cache === null) cache = readFromStorage();
  return cache;
}

function commit(next: readonly RecentQuiz[]): void {
  cache = next.length > 0 ? Object.freeze(next.slice()) : EMPTY;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      // storage full / disabled — keep the in-memory cache regardless.
    }
  }
  for (const l of listeners) l();
}

function getSnapshot(): readonly RecentQuiz[] {
  return ensure();
}

function getServerSnapshot(): readonly RecentQuiz[] {
  return EMPTY;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = readFromStorage();
      cb();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// React hook: live list of recent quizzes (most recent first).
export function useRecentQuizzes(): readonly RecentQuiz[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Imperative read (e.g. one-off, outside render).
export function getRecentQuizzes(): readonly RecentQuiz[] {
  return ensure();
}

// Upsert a quiz to the top of the list. Call after create / open / save so the
// title stays fresh. No-op-safe on the server (window-guarded).
export function rememberQuiz(input: {
  quizId: string;
  token: string;
  title: string;
}): void {
  if (!input.quizId || !input.token) return;
  const rest = ensure().filter((q) => q.quizId !== input.quizId);
  const entry: RecentQuiz = {
    quizId: input.quizId,
    token: input.token,
    title: input.title?.trim() || "無題のクイズ",
    savedAt: Date.now(),
  };
  commit([entry, ...rest].slice(0, MAX));
}

// Remove a quiz from the local list (the underlying quiz is untouched).
export function forgetQuiz(quizId: string): void {
  commit(ensure().filter((q) => q.quizId !== quizId));
}

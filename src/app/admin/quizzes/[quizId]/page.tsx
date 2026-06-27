"use client";

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { QuizEditorIsland } from "./QuizEditorIsland";

// /admin/quizzes/[quizId] — the login-free quiz editor.
//
// Capability model: the quizId comes from the route, the secret edit_token from
// `?t=`. The editor island calls get_quiz_for_edit(quizId, token) on mount; an
// invalid/missing token renders a clear "編集リンクが正しくありません" screen.
// There is NO session/login — the RPCs (granted to anon) validate the token.
//
// Next 16: route `params` is a Promise in Client Components, so we unwrap it with
// React's `use`. useSearchParams requires a Suspense boundary.
export default function EditQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);
  return (
    <Suspense fallback={null}>
      <EditorWithToken quizId={quizId} />
    </Suspense>
  );
}

function EditorWithToken({ quizId }: { quizId: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("t") ?? "";
  return <QuizEditorIsland quizId={quizId} token={token} />;
}

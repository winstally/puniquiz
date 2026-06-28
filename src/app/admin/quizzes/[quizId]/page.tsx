import { AdminInviteRequired } from "@/app/admin/admin-ui";
import { isAdminInviteConfigured } from "@/lib/admin/invite";
import { hasAdminInviteAccess } from "@/lib/admin/invite-server";
import { QuizEditorIsland } from "./QuizEditorIsland";

// /admin/quizzes/[quizId] — invite-gated quiz editor.
//
// The admin invite cookie gates access to the editor route. The quizId comes
// from the route, and the secret edit_token from `?t=` still gates the specific
// quiz inside the existing RPC.
export default async function EditQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ t?: string | string[] | undefined }>;
}) {
  if (!(await hasAdminInviteAccess())) {
    return (
      <AdminInviteRequired
        reason={isAdminInviteConfigured() ? undefined : "missing_config"}
      />
    );
  }
  const { quizId } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.t) ? (query.t[0] ?? "") : (query.t ?? "");
  return <QuizEditorIsland quizId={quizId} token={token} />;
}

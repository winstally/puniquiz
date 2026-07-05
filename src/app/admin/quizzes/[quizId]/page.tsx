import { AdminInviteAccept } from "@/app/admin/AdminInviteAccept";
import { AdminInviteRequired } from "@/app/admin/AdminInviteRequired";
import { isAdminInviteConfigured, isValidAdminInviteToken } from "@/lib/admin/invite";
import { adminInviteTokenForLink, hasAdminInviteAccess } from "@/lib/admin/invite-server";
import { QuizEditorIsland } from "./QuizEditorIsland";

// /admin/quizzes/[quizId] — invite-gated quiz editor.
//
// The admin invite cookie gates access to the editor route and server actions.
export default async function EditQuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ quizId: string }>;
  searchParams: Promise<{ invite?: string | string[] | undefined }>;
}) {
  const { quizId } = await params;
  if (!(await hasAdminInviteAccess())) {
    const query = await searchParams;
    const invite = Array.isArray(query.invite)
      ? (query.invite[0] ?? "")
      : (query.invite ?? "");
    if (invite && isValidAdminInviteToken(invite)) {
      return (
        <AdminInviteAccept
          invite={invite}
          redirectTo={`/admin/quizzes/${quizId}`}
        />
      );
    }
    return (
      <AdminInviteRequired
        reason={isAdminInviteConfigured() ? undefined : "missing_config"}
      />
    );
  }
  const invite = encodeURIComponent(adminInviteTokenForLink());
  const inviteLinkPath = `/admin/quizzes/${encodeURIComponent(quizId)}?invite=${invite}`;
  return <QuizEditorIsland quizId={quizId} inviteLinkPath={inviteLinkPath} />;
}

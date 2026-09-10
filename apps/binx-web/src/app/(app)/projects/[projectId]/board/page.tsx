/**
 * page.tsx - Project Board
 *
 * The project's full kanban board, on its own page so it has room to
 * breathe (columns scroll horizontally at full width rather than being
 * squeezed into a dashboard card).
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/board/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getCurrentUser } from "@/lib/auth";
import { getProjectBoard, getProjectMembers, getProjectTags } from "@/lib/projects";
import KanbanBoard from "@/components/forms/projects/KanbanBoard/KanbanBoard";

export const metadata: Metadata = { title: "Board" };

interface ProjectBoardPageProps {
  params: Promise<{ projectId: string }>;
}

const ProjectBoardPage = async ({ params }: ProjectBoardPageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login");
  }

  const [columns, projectMembers, projectTags] = await Promise.all([
    getProjectBoard(currentAgency.id, projectId),
    getProjectMembers(currentAgency.id, projectId),
    getProjectTags(currentAgency.id, projectId),
  ]);

  return (
    <KanbanBoard
      agencyId={currentAgency.id}
      projectId={projectId}
      columns={columns}
      projectMembers={projectMembers}
      projectTags={projectTags}
      currentUserId={user.id}
      canModerateComments={currentAgency.role === "owner" || currentAgency.role === "admin"}
    />
  );
};

export default ProjectBoardPage;

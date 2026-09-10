/**
 * page.tsx - Project Canvas
 *
 * The project's freeform collaboration canvas — a Milanote-style board of
 * notes and images the team and the client arrange together in real time.
 * Distinct from the Kanban "Board" tab (structured columns of tasks).
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/canvas/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getCurrentUser } from "@/lib/auth";
import { getBoard } from "@/lib/boards";
import StaffBoardStage from "@/components/boards/BoardStage/StaffBoardStage";

export const metadata: Metadata = { title: "Canvas" };

interface ProjectCanvasPageProps {
  params: Promise<{ projectId: string }>;
}

const ProjectCanvasPage = async ({ params }: ProjectCanvasPageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [board, currentUser] = await Promise.all([getBoard(currentAgency.id, projectId), getCurrentUser()]);
  if (!currentUser) {
    redirect("/auth/login");
  }

  return (
    <StaffBoardStage
      agencyId={currentAgency.id}
      projectId={projectId}
      boardId={board.board_id}
      currentUserId={currentUser.id}
      canModerate={currentAgency.role === "owner" || currentAgency.role === "admin"}
      initialItems={board.items}
    />
  );
};

export default ProjectCanvasPage;

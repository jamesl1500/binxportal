/**
 * page.tsx - Project Canvas
 *
 * The project's collaboration canvas — a Milanote-style board of notes,
 * images, to-do lists (backed by the project's real tasks), links, files,
 * columns and nested boards that the team and the client arrange together
 * in real time. `?board=<id>` opens a nested board; no param is the
 * project's root board. Distinct from the Kanban "Board" tab, which shows
 * the same tasks as structured columns.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/canvas/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { AuthApiError, getCurrentUser } from "@/lib/auth";
import { getBoard } from "@/lib/boards";
import { getAgencyProject } from "@/lib/projects";
import StaffBoardStage from "@/components/boards/BoardStage/StaffBoardStage";

export const metadata: Metadata = { title: "Canvas" };

interface ProjectCanvasPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ board?: string | string[] }>;
}

const ProjectCanvasPage = async ({
  params,
  searchParams,
}: ProjectCanvasPageProps) => {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const boardParam = Array.isArray(query.board) ? query.board[0] : query.board;
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  let board;
  let currentUser;
  let project;
  try {
    [board, currentUser, project] = await Promise.all([
      getBoard(currentAgency.id, projectId, boardParam),
      getCurrentUser(),
      getAgencyProject(currentAgency.id, projectId),
    ]);
  } catch (error) {
    if (
      error instanceof AuthApiError &&
      (error.status === 404 || error.status === 422)
    ) {
      notFound();
    }
    throw error;
  }
  if (!currentUser) {
    redirect("/auth/login");
  }

  return (
    <StaffBoardStage
      // A fresh stage (pan/zoom, selection) per board.
      key={board.board_id}
      agencyId={currentAgency.id}
      projectId={projectId}
      projectName={project.name}
      boardId={board.board_id}
      path={board.path}
      currentUserId={currentUser.id}
      canModerate={
        currentAgency.role === "owner" || currentAgency.role === "admin"
      }
      initialItems={board.items}
      initialTasks={board.tasks}
    />
  );
};

export default ProjectCanvasPage;

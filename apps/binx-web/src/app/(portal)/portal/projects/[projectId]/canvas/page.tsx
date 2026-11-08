/**
 * page.tsx - Portal Project Canvas
 *
 * The shared project collaboration canvas as the client sees it — full
 * add / move / edit / delete, live-synced with the agency team. The header
 * and tab nav live in the layout above.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/canvas/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthApiError, getCurrentUser } from "@/lib/auth";
import { getPortalBoard, getPortalProject } from "@/lib/portal";
import PortalBoardStage from "@/components/boards/BoardStage/PortalBoardStage";

export const metadata: Metadata = { title: "Canvas" };

interface PortalCanvasPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ board?: string | string[] }>;
}

const PortalCanvasPage = async ({
  params,
  searchParams,
}: PortalCanvasPageProps) => {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const boardParam = Array.isArray(query.board) ? query.board[0] : query.board;

  let board;
  let currentUser;
  let project;
  try {
    [board, currentUser, project] = await Promise.all([
      getPortalBoard(projectId, boardParam),
      getCurrentUser(),
      getPortalProject(projectId),
    ]);
  } catch (error) {
    if (
      error instanceof AuthApiError &&
      (error.status === 404 || error.status === 403 || error.status === 422)
    ) {
      notFound();
    }
    throw error;
  }
  if (!currentUser) {
    notFound();
  }

  return (
    <PortalBoardStage
      // A fresh stage (pan/zoom, selection) per board.
      key={board.board_id}
      projectId={projectId}
      projectName={project.name}
      boardId={board.board_id}
      path={board.path}
      currentUserId={currentUser.id}
      initialItems={board.items}
      initialTasks={board.tasks}
    />
  );
};

export default PortalCanvasPage;

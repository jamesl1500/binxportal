/**
 * page.tsx - Portal Project Canvas
 *
 * The shared project collaboration canvas as the client sees it — full
 * add / move / edit / delete, live-synced with the agency team. The header
 * and tab nav live in the layout above.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/canvas/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthApiError, getCurrentUser } from "@/lib/auth";
import { getPortalBoard } from "@/lib/portal";
import PortalBoardStage from "@/components/boards/BoardStage/PortalBoardStage";

export const metadata: Metadata = { title: "Canvas" };

interface PortalCanvasPageProps {
  params: Promise<{ projectId: string }>;
}

const PortalCanvasPage = async ({ params }: PortalCanvasPageProps) => {
  const { projectId } = await params;

  let board;
  let currentUser;
  try {
    [board, currentUser] = await Promise.all([getPortalBoard(projectId), getCurrentUser()]);
  } catch (error) {
    if (error instanceof AuthApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }
  if (!currentUser) {
    notFound();
  }

  return (
    <PortalBoardStage
      projectId={projectId}
      boardId={board.board_id}
      currentUserId={currentUser.id}
      initialItems={board.items}
    />
  );
};

export default PortalCanvasPage;

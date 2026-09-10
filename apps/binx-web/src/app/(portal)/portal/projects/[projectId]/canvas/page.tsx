/**
 * page.tsx - Portal Project Canvas
 *
 * The shared project collaboration canvas as the client sees it — full
 * add / move / edit / delete, live-synced with the agency team.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/canvas/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthApiError, getCurrentUser } from "@/lib/auth";
import { getPortalBoard, getPortalProject } from "@/lib/portal";
import PortalBoardStage from "@/components/boards/BoardStage/PortalBoardStage";

import styles from "../../../page.module.scss";

export const metadata: Metadata = { title: "Canvas" };

interface PortalCanvasPageProps {
  params: Promise<{ projectId: string }>;
}

const PortalCanvasPage = async ({ params }: PortalCanvasPageProps) => {
  const { projectId } = await params;

  let project;
  let board;
  let currentUser;
  try {
    [project, board, currentUser] = await Promise.all([
      getPortalProject(projectId),
      getPortalBoard(projectId),
      getCurrentUser(),
    ]);
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
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href={`/portal/projects/${projectId}`} className={styles.link}>
          ← {project.name}
        </Link>
        <h1 className={styles.title}>Canvas</h1>
        <p className={styles.subtitle}>
          A shared space for notes and references. Everything here is live — the {project.name} team sees your
          changes as you make them.
        </p>
      </header>

      <PortalBoardStage
        projectId={projectId}
        boardId={board.board_id}
        currentUserId={currentUser.id}
        initialItems={board.items}
      />
    </div>
  );
};

export default PortalCanvasPage;

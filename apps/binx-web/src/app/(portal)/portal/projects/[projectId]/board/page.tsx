/**
 * page.tsx - Portal Project Board
 *
 * The project's task board as a client sees it — the same columns the
 * agency team works in, read-only. The header and tab nav live in the
 * layout above.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/board/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getPortalTaskBoard } from "@/lib/portal";
import PortalTaskBoard from "@/components/portal/PortalTaskBoard/PortalTaskBoard";

export const metadata: Metadata = { title: "Board" };

interface PortalBoardPageProps {
  params: Promise<{ projectId: string }>;
}

const PortalBoardPage = async ({ params }: PortalBoardPageProps) => {
  const { projectId } = await params;

  let columns;
  try {
    columns = await getPortalTaskBoard(projectId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return <PortalTaskBoard columns={columns} />;
};

export default PortalBoardPage;

/**
 * page.tsx - Project Kickoff
 *
 * The project's kickoff: build it (draft), send it, watch it (sent), or
 * review answers and convert them to tasks (completed). No kickoff yet just
 * shows the builder pre-filled from scratch or a template. The
 * [projectId] layout above already resolved the project and renders the
 * header/tabs.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/kickoff/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getKickoff, getKickoffTemplates } from "@/lib/kickoffs";
import { getProjectBoard } from "@/lib/projects";
import KickoffBuilder from "@/components/kickoffs/KickoffBuilder/KickoffBuilder";
import KickoffStatusView from "@/components/kickoffs/KickoffStatusView/KickoffStatusView";

export const metadata: Metadata = { title: "Kickoff" };

interface ProjectKickoffPageProps {
  params: Promise<{ projectId: string }>;
}

const ProjectKickoffPage = async ({ params }: ProjectKickoffPageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [kickoff, templates] = await Promise.all([
    getKickoff(currentAgency.id, projectId),
    getKickoffTemplates(currentAgency.id),
  ]);

  if (!kickoff || kickoff.status === "draft") {
    return (
      <KickoffBuilder
        agencyId={currentAgency.id}
        projectId={projectId}
        kickoff={kickoff}
        templates={templates}
      />
    );
  }

  const board = await getProjectBoard(currentAgency.id, projectId);
  return (
    <KickoffStatusView
      agencyId={currentAgency.id}
      projectId={projectId}
      kickoff={kickoff}
      taskLists={board.map((column) => ({ id: column.id, name: column.name }))}
    />
  );
};

export default ProjectKickoffPage;

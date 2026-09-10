/**
 * page.tsx - Project Settings
 *
 * Editing the project's own details (name, client, status, dates,
 * description), its custom member roles and task tags, and the danger zone
 * for deleting it. The four concerns are split into sub-tabs
 * (ProjectSettingsTabs) so one is visible at a time instead of one long
 * scroll; this Server Component just resolves the data all four need.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/settings/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getAgencyProject, getProjectRoles, getProjectTags } from "@/lib/projects";
import ProjectSettingsTabs from "@/components/forms/projects/ProjectSettingsTabs/ProjectSettingsTabs";

export const metadata: Metadata = { title: "Settings" };

interface ProjectSettingsPageProps {
  params: Promise<{ projectId: string }>;
}

const ProjectSettingsPage = async ({ params }: ProjectSettingsPageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  // Cache-deduped against the layout's fetch — see getAgencyProject in lib/projects.ts.
  const [project, clients, roles, tags] = await Promise.all([
    getAgencyProject(currentAgency.id, projectId),
    getAgencyClients(currentAgency.id),
    getProjectRoles(currentAgency.id, projectId),
    getProjectTags(currentAgency.id, projectId),
  ]);

  return (
    <ProjectSettingsTabs
      agencyId={currentAgency.id}
      project={project}
      clients={clients}
      roles={roles}
      tags={tags}
    />
  );
};

export default ProjectSettingsPage;

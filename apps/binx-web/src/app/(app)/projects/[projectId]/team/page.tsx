/**
 * page.tsx - Project Team
 *
 * The full team roster for a project: a sortable, searchable table of who's
 * assigned, the custom project role each person holds, and the controls to
 * assign or remove people. The dashboard teases the same roster inline
 * (ProjectMembersPanel); this gives it a direct, linkable page with room for
 * every column.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/team/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAgencyMembers, getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyProject, getProjectMembers, getProjectRoles } from "@/lib/projects";
import ProjectTeamTable from "@/components/forms/projects/ProjectTeamTable/ProjectTeamTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Team" };

interface ProjectTeamPageProps {
  params: Promise<{ projectId: string }>;
}

const ProjectTeamPage = async ({ params }: ProjectTeamPageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  // Cache-deduped against the layout's fetch — see getAgencyProject in lib/projects.ts.
  const [project, members, agencyMembers, roles] = await Promise.all([
    getAgencyProject(currentAgency.id, projectId),
    getProjectMembers(currentAgency.id, projectId),
    getAgencyMembers(currentAgency.id),
    getProjectRoles(currentAgency.id, projectId),
  ]);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Team</h2>
        <p className={styles.sectionSubtitle}>Who&apos;s actively working on {project.name}, and in what role.</p>
        <ProjectTeamTable
          agencyId={currentAgency.id}
          projectId={project.id}
          members={members}
          agencyMembers={agencyMembers}
          roles={roles}
        />
      </section>
    </div>
  );
};

export default ProjectTeamPage;

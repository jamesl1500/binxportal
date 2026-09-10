/**
 * page.tsx - Project Files
 *
 * The project's full file library — a sortable, searchable table split out
 * from the dashboard (which only teases the first few files) so there's room
 * for the whole list plus the upload control.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/files/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyProject, getProjectFiles } from "@/lib/projects";
import ProjectFilesTable from "@/components/forms/projects/ProjectFilesTable/ProjectFilesTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Files" };

interface ProjectFilesPageProps {
  params: Promise<{ projectId: string }>;
}

const ProjectFilesPage = async ({ params }: ProjectFilesPageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  // Cache-deduped against the layout's fetch — see getAgencyProject in lib/projects.ts.
  const [project, files] = await Promise.all([
    getAgencyProject(currentAgency.id, projectId),
    getProjectFiles(currentAgency.id, projectId),
  ]);

  return (
    <div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Files</h2>
        <p className={styles.sectionSubtitle}>Briefs, assets, and deliverables shared for {project.name}.</p>
        <ProjectFilesTable agencyId={currentAgency.id} projectId={project.id} files={files} />
      </section>
    </div>
  );
};

export default ProjectFilesPage;

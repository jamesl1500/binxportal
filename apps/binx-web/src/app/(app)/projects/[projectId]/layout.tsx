/**
 * layout.tsx - Project Shell
 *
 * Shared chrome for a project's pages (dashboard, board, team, files,
 * settings): the back link, header (name, client, status), and tab nav.
 * Fetches the project itself so a bad :projectId 404s before any of those
 * pages render — each page re-fetches the same project via `getAgencyProject`,
 * which is wrapped in React's `cache()`, so that's one request, not two.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/layout.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyProject, PROJECT_STATUS_LABELS } from "@/lib/projects";
import ProjectTabs from "@/components/navigation/ProjectTabs/ProjectTabs";

import styles from "./layout.module.scss";

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  try {
    const { currentAgency } = await getCurrentAgencyContext();
    if (!currentAgency) return {};
    const project = await getAgencyProject(currentAgency.id, projectId);
    // The project name becomes the title base for every tab under it
    // ("Board · Acme Rebrand", "Canvas · Acme Rebrand", …).
    return { title: { default: project.name, template: `%s · ${project.name}` } };
  } catch {
    return {};
  }
}

const ProjectLayout = async ({ children, params }: ProjectLayoutProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  let project;
  try {
    project = await getAgencyProject(currentAgency.id, projectId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div>
      <Link href="/projects" className={styles.backLink}>
        ← All projects
      </Link>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Project · {project.client_name}</span>
          <h1 className={styles.title}>{project.name}</h1>
        </div>
        <span className={styles.statusBadge} data-status={project.status}>
          {PROJECT_STATUS_LABELS[project.status] ?? project.status}
        </span>
      </div>

      <ProjectTabs projectId={project.id} />

      <div className={styles.content}>{children}</div>
    </div>
  );
};

export default ProjectLayout;

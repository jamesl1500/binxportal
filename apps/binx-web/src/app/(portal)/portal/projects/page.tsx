/**
 * page.tsx - Portal Projects
 *
 * Every project the agency is running for this client, with a progress bar.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import { getPortalProjects } from "@/lib/portal";
import ProjectProgress from "@/components/portal/ProjectProgress/ProjectProgress";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Projects" };

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

const PortalProjectsPage = async () => {
  const projects = await getPortalProjects();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Projects</span>
        <h1 className={styles.title}>Your projects</h1>
        <p className={styles.subtitle}>{projects.length} in total.</p>
      </header>

      {projects.length === 0 ? (
        <p className={styles.empty}>No projects yet.</p>
      ) : (
        <ul className={styles.projectList}>
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/portal/projects/${project.id}`} className={styles.projectRow}>
                <span className={styles.projectName}>
                  {project.name}
                  <span className={styles.invoiceStatus} data-status={project.status}>
                    {" "}
                    · {STATUS_LABELS[project.status] ?? project.status}
                  </span>
                </span>
                <ProjectProgress progress={project.progress} compact />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PortalProjectsPage;

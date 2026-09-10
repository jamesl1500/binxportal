/**
 * page.tsx - Portal Project Detail
 *
 * One project as the client sees it: description, dates, and a read-only
 * progress view (the board columns as counts). No assignees, no internal
 * notes — the portal project schema on binx-api trims those.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getPortalProject } from "@/lib/portal";
import ProjectProgress from "@/components/portal/ProjectProgress/ProjectProgress";

import styles from "../../page.module.scss";

interface PortalProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: PortalProjectPageProps): Promise<Metadata> {
  const { projectId } = await params;
  try {
    const project = await getPortalProject(projectId);
    return { title: project.name };
  } catch {
    return { title: "Project" };
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const PortalProjectDetailPage = async ({ params }: PortalProjectPageProps) => {
  const { projectId } = await params;

  let project;
  try {
    project = await getPortalProject(projectId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/portal/projects" className={styles.link}>
          ← All projects
        </Link>
        <h1 className={styles.title}>{project.name}</h1>
        {project.description && <p className={styles.subtitle}>{project.description}</p>}
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Collaboration canvas</h2>
        </div>
        <Link href={`/portal/projects/${projectId}/canvas`} className={styles.projectRow}>
          <span className={styles.projectName}>Open the shared canvas</span>
          <span>→</span>
        </Link>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Progress</h2>
        <ProjectProgress progress={project.progress} columns={project.columns} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Timeline</h2>
        <ul className={styles.invoiceList}>
          <li className={styles.invoiceRow}>
            <span>Start date</span>
            <span className={styles.invoiceAmount}>{formatDate(project.start_date)}</span>
          </li>
          <li className={styles.invoiceRow}>
            <span>Due date</span>
            <span className={styles.invoiceAmount}>{formatDate(project.due_date)}</span>
          </li>
        </ul>
      </section>
    </div>
  );
};

export default PortalProjectDetailPage;

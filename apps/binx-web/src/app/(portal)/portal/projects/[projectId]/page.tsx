/**
 * page.tsx - Portal Project Overview
 *
 * Progress and timeline for a project, as the client sees it. The header and
 * tab nav (Overview / Board / Canvas) live in the layout above; this page
 * only needs the project's own progress/dates.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/page.tsx
 * @author Binx.io
 */
import { notFound } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { getPortalProject } from "@/lib/portal";
import ProjectProgress from "@/components/portal/ProjectProgress/ProjectProgress";

import styles from "../../page.module.scss";

interface PortalProjectOverviewPageProps {
  params: Promise<{ projectId: string }>;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const PortalProjectOverviewPage = async ({ params }: PortalProjectOverviewPageProps) => {
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
    <>
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
    </>
  );
};

export default PortalProjectOverviewPage;

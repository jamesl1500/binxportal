/**
 * layout.tsx - Portal Project Shell
 *
 * Shared chrome for a client-portal project's pages (Overview / Board /
 * Canvas): the back link, header (name, description, status and due date),
 * and tab nav. Each page still re-fetches the project itself via
 * `getPortalProject` — wrapped in React's `cache()`, so that's one request
 * per render, not two.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/layout.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock } from "lucide-react";

import { AuthApiError } from "@/lib/auth";
import { getPortalProject } from "@/lib/portal";
import { dueLabel, projectStatusLabel } from "@/lib/portal-insights";
import PortalProjectTabs from "@/components/navigation/PortalProjectTabs/PortalProjectTabs";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";

import styles from "../../page.module.scss";

interface PortalProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  try {
    const project = await getPortalProject(projectId);
    // The project name becomes the title base for every tab under it
    // ("Board · Rebrand", "Canvas · Rebrand", …).
    return { title: { default: project.name, template: `%s · ${project.name}` } };
  } catch {
    return {};
  }
}

const PortalProjectLayout = async ({ children, params }: PortalProjectLayoutProps) => {
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

  const finished = project.status === "completed" || project.status === "archived";
  const due = dueLabel(project.due_date, new Date(), { done: finished });

  return (
    <div className={styles.page}>
      <PortalPageHeader
        back={{ href: "/portal/projects", label: "All projects" }}
        title={project.name}
        subtitle={project.description ?? undefined}
      >
        <div className={styles.metaRow}>
          <span className={styles.pill} data-status={project.status}>
            {projectStatusLabel(project.status)}
          </span>
          {due && (
            <span className={styles.metaItem} data-tone={due.tone}>
              <CalendarClock aria-hidden="true" />
              {due.label}
            </span>
          )}
          <span className={styles.metaItem}>{project.progress.percent}% complete</span>
        </div>
      </PortalPageHeader>

      <PortalProjectTabs projectId={projectId} />

      {children}
    </div>
  );
};

export default PortalProjectLayout;

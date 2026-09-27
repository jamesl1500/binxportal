/**
 * PortalProjectCard.tsx
 *
 * One project as a card: name, status pill, a two-line description, the
 * progress bar, and a due-date chip that turns amber as the date nears and
 * red once it's passed. Shared by the portal home and the Projects page.
 * No hooks, so it renders from server and client components alike.
 *
 * @module apps/binx-web/src/components/portal/PortalProjectCard/PortalProjectCard.tsx
 * @author Binx.io
 */
import Link from "next/link";
import { CalendarClock } from "lucide-react";

import type { PortalProject } from "@/lib/portal";
import { dueLabel, projectStatusLabel } from "@/lib/portal-insights";
import ProjectProgress from "@/components/portal/ProjectProgress/ProjectProgress";

import styles from "./PortalProjectCard.module.scss";

interface PortalProjectCardProps {
  project: PortalProject;
  /** "Now" for the due-date chip — passed in so a list computes it once. */
  now: Date;
}

const PortalProjectCard = ({ project, now }: PortalProjectCardProps) => {
  const finished = project.status === "completed" || project.status === "archived";
  const due = dueLabel(project.due_date, now, { done: finished });

  return (
    <Link href={`/portal/projects/${project.id}`} className={styles.card}>
      <span className={styles.head}>
        <span className={styles.name}>{project.name}</span>
        <span className={styles.status} data-status={project.status}>
          {projectStatusLabel(project.status)}
        </span>
      </span>
      {project.description && <span className={styles.description}>{project.description}</span>}
      <ProjectProgress progress={project.progress} compact />
      {due && (
        <span className={styles.due} data-tone={due.tone}>
          <CalendarClock aria-hidden="true" />
          {due.label}
        </span>
      )}
    </Link>
  );
};

export default PortalProjectCard;

/**
 * page.tsx - Portal Project Overview
 *
 * A project as the client sees it: progress by board column, a timeline
 * bar showing how far through the schedule it is (with a "today" marker),
 * and shortcuts into the board, the shared canvas, and a conversation with
 * the team. The header and tab nav live in the layout above.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/page.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, KanbanSquare, MessageSquare, Shapes } from "lucide-react";

import { AuthApiError } from "@/lib/auth";
import { getPortalProject } from "@/lib/portal";
import { daysUntil, formatDay } from "@/lib/portal-insights";
import ProjectProgress from "@/components/portal/ProjectProgress/ProjectProgress";

import styles from "../../page.module.scss";

interface PortalProjectOverviewPageProps {
  params: Promise<{ projectId: string }>;
}

const PortalProjectOverviewPage = async ({
  params,
}: PortalProjectOverviewPageProps) => {
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

  const now = new Date();
  const base = `/portal/projects/${projectId}`;

  // Share of the schedule elapsed, when both ends of it are known.
  let elapsed: number | null = null;
  if (project.start_date && project.due_date) {
    const span =
      daysUntil(project.due_date, now) - daysUntil(project.start_date, now);
    const gone = -daysUntil(project.start_date, now);
    elapsed =
      span > 0
        ? Math.min(100, Math.max(0, Math.round((gone / span) * 100)))
        : 100;
  }
  const daysLeft = project.due_date ? daysUntil(project.due_date, now) : null;

  const shortcuts = [
    {
      href: `${base}/board`,
      icon: KanbanSquare,
      title: "Task board",
      body: "Every task and where it sits, updated live by the team.",
    },
    {
      href: `${base}/canvas`,
      icon: Shapes,
      title: "Shared canvas",
      body: "Add notes and images, comment, and approve designs.",
    },
    {
      href: "/portal/messages",
      icon: MessageSquare,
      title: "Ask the team",
      body: "Questions or feedback on this project? Send a message.",
    },
  ];

  return (
    <div className={styles.overviewGrid}>
      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Progress</h2>
        <ProjectProgress
          progress={project.progress}
          columns={project.columns}
        />
      </section>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Timeline</h2>
        {elapsed !== null && (
          <div
            className={styles.timeline}
            role="img"
            aria-label={`${elapsed}% of the scheduled time has passed`}
          >
            <span className={styles.timelineTrack} />
            <span
              className={styles.timelineDone}
              style={{ width: `${elapsed}%` }}
            />
            {elapsed > 0 && elapsed < 100 && (
              <span
                className={styles.timelineToday}
                style={{ left: `${elapsed}%` }}
              >
                Today
              </span>
            )}
          </div>
        )}
        <dl className={styles.dates}>
          <div>
            <dt>Start date</dt>
            <dd>{project.start_date ? formatDay(project.start_date) : "—"}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{project.due_date ? formatDay(project.due_date) : "—"}</dd>
          </div>
          <div>
            <dt>
              {daysLeft !== null && daysLeft < 0 ? "Past due" : "Days left"}
            </dt>
            <dd>{daysLeft === null ? "—" : Math.abs(daysLeft)}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.shortcuts} aria-label="Jump in">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <Link
              key={shortcut.title}
              href={shortcut.href}
              className={styles.shortcut}
            >
              <span className={styles.shortcutIcon} aria-hidden="true">
                <Icon />
              </span>
              <span className={styles.shortcutTitle}>
                {shortcut.title}
                <ArrowRight aria-hidden="true" />
              </span>
              <span className={styles.shortcutBody}>{shortcut.body}</span>
            </Link>
          );
        })}
      </section>
    </div>
  );
};

export default PortalProjectOverviewPage;

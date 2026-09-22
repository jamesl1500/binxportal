/**
 * page.tsx - Project Time Tracking
 *
 * The project's Time tab: the caller's start/stop timer, a manual-entry
 * form, an uninvoiced summary, and the full list of this project's logged
 * time with edit/delete and "generate an invoice from selected entries".
 * The project itself is already resolved (and 404-checked) by the layout
 * above — `getAgencyProject` is cached, so this page's call shares that
 * fetch. `client_id` comes straight off the project (denormalized onto
 * ProjectRead), so no extra lookup is needed to bill the client.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/time/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { formatMoneyCents } from "@/lib/money";
import { getAgencyProject, getProjectBoard } from "@/lib/projects";
import { getRunningTimer, getTimeEntries, getUninvoicedSummary } from "@/lib/time-tracking";
import ManualEntryForm from "@/components/forms/projects/ManualEntryForm/ManualEntryForm";
import TimeEntriesTable from "@/components/forms/projects/TimeEntriesTable/TimeEntriesTable";
import TimerWidget from "@/components/forms/projects/TimerWidget/TimerWidget";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Time" };

interface ProjectTimePageProps {
  params: Promise<{ projectId: string }>;
}

const ProjectTimePage = async ({ params }: ProjectTimePageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  // Cache-deduped against the layout's fetch — see getAgencyProject in lib/projects.ts.
  const [project, board, runningTimer, entries, summary] = await Promise.all([
    getAgencyProject(currentAgency.id, projectId),
    getProjectBoard(currentAgency.id, projectId),
    getRunningTimer(currentAgency.id),
    getTimeEntries(currentAgency.id, { projectId }),
    getUninvoicedSummary(currentAgency.id, projectId),
  ]);

  const tasks = board.flatMap((column) => column.tasks.map((task) => ({ id: task.id, title: task.title })));

  return (
    <div className={styles.page}>
      <TimerWidget agencyId={currentAgency.id} projectId={project.id} tasks={tasks} runningTimer={runningTimer} />

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Log time manually</h2>
        </div>
        <ManualEntryForm agencyId={currentAgency.id} projectId={project.id} tasks={tasks} />
      </div>

      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Uninvoiced entries</span>
          <p className={styles.statValue}>{summary.entry_count}</p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Uninvoiced hours</span>
          <p className={styles.statValue}>{(summary.total_minutes / 60).toFixed(1)}</p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Uninvoiced billable amount</span>
          <p className={styles.statValue}>{formatMoneyCents(summary.billable_amount_cents)}</p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Missing a rate</span>
          <p className={styles.statValue}>{summary.unrated_entry_count}</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Time entries</h2>
        </div>
        <TimeEntriesTable
          agencyId={currentAgency.id}
          projectId={project.id}
          clientId={project.client_id}
          entries={entries}
          tasks={tasks}
        />
      </div>
    </div>
  );
};

export default ProjectTimePage;

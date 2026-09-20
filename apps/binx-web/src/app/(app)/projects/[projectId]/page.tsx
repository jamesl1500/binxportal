/**
 * page.tsx - Project Dashboard
 *
 * The project overview: at-a-glance stat cards, a board progress summary
 * linking to the dedicated board page, and the team/files panels — all in
 * white cards on the page's paper background so each is clearly separated.
 * The [projectId] layout above this page already resolved the project and
 * renders the header/tabs; this page re-fetches it too (cache-deduped, see
 * getAgencyProject) since layouts can't pass data down to pages directly.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/page.tsx
 * @author Binx.io
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAgencyMembers, getCurrentAgencyContext } from "@/lib/agencies";
import { getMeetings } from "@/lib/meetings";
import { getAgencyProject, getProjectBoard, getProjectFiles, getProjectMembers } from "@/lib/projects";
import ScheduleMeetingDialog from "@/components/forms/meetings/ScheduleMeetingDialog/ScheduleMeetingDialog";
import UpcomingMeetingsCard from "@/components/meetings/UpcomingMeetingsCard/UpcomingMeetingsCard";
import ProjectMembersPanel from "@/components/forms/projects/ProjectMembersPanel/ProjectMembersPanel";
import AiProjectSummaryCard from "@/components/projects/AiProjectSummaryCard/AiProjectSummaryCard";

import styles from "./page.module.scss";

interface ProjectDashboardPageProps {
  params: Promise<{ projectId: string }>;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const ProjectDashboardPage = async ({ params }: ProjectDashboardPageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  // Already resolved (and 404-checked) by the layout above — this call
  // shares that same request-scoped fetch via cache(), so it's free.
  const project = await getAgencyProject(currentAgency.id, projectId);

  const [members, agencyMembers, board, files, meetings] = await Promise.all([
    getProjectMembers(currentAgency.id, projectId),
    getAgencyMembers(currentAgency.id),
    getProjectBoard(currentAgency.id, projectId),
    getProjectFiles(currentAgency.id, projectId),
    getMeetings(currentAgency.id, {
      projectId,
      status: "scheduled",
      fromDate: new Date().toISOString().slice(0, 10),
    }),
  ]);

  const totalTasks = board.reduce((sum, column) => sum + column.tasks.length, 0);
  const timeline =
    project.start_date || project.due_date
      ? `${project.start_date ? formatDate(project.start_date) : "No start"} → ${project.due_date ? formatDate(project.due_date) : "No due date"}`
      : "No dates set";

  return (
    <div>
      <div className={styles.statGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Client</span>
          <p className={styles.statValue}>{project.client_name}</p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Timeline</span>
          <p className={styles.statValue}>{timeline}</p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Team</span>
          <p className={styles.statValue}>
            {members.length} {members.length === 1 ? "person" : "people"}
          </p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Tasks</span>
          <p className={styles.statValue}>{totalTasks} total</p>
        </div>
      </div>

      <AiProjectSummaryCard agencyId={currentAgency.id} projectId={project.id} />

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Board</h2>
          <Link href={`/projects/${project.id}/board`} className={styles.cardLink}>
            Open board →
          </Link>
        </div>
        {board.length === 0 ? (
          <p className={styles.emptyText}>This board has no lists yet.</p>
        ) : (
          <ul className={styles.boardSummary}>
            {board.map((column) => (
              <li key={column.id} className={styles.boardSummaryRow}>
                <span className={styles.boardSummaryName}>{column.name}</span>
                <span className={styles.boardSummaryCount}>{column.tasks.length}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Meetings</h2>
          <ScheduleMeetingDialog
            agencyId={currentAgency.id}
            clients={[{ id: project.client_id, name: project.client_name }]}
            projects={[{ id: project.id, name: project.name, client_id: project.client_id }]}
            defaultClientId={project.client_id}
            defaultProjectId={project.id}
          />
        </div>
        <UpcomingMeetingsCard meetings={meetings} limit={4} moreHref={`/clients/${project.client_id}/meetings`} />
      </div>

      <div className={styles.row}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Team</h2>
          </div>
          <p className={styles.cardSubtitle}>Who&apos;s actively working on this project.</p>
          <ProjectMembersPanel
            agencyId={currentAgency.id}
            projectId={project.id}
            members={members}
            agencyMembers={agencyMembers}
          />
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Files</h2>
            <Link href={`/projects/${project.id}/files`} className={styles.cardLink}>
              View files →
            </Link>
          </div>
          <p className={styles.cardSubtitle}>Briefs, assets, and deliverables shared for this project.</p>
          {files.length === 0 ? (
            <p className={styles.emptyText}>No files yet.</p>
          ) : (
            <ul className={styles.fileSummary}>
              {files.slice(0, 4).map((file) => (
                <li key={file.id} className={styles.fileSummaryRow}>
                  {file.file_name}
                </li>
              ))}
            </ul>
          )}
          {files.length > 4 && <p className={styles.fileSummaryMore}>+{files.length - 4} more</p>}
        </div>
      </div>

      {project.description && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Description</h2>
          </div>
          <p className={styles.description}>{project.description}</p>
        </div>
      )}
    </div>
  );
};

export default ProjectDashboardPage;

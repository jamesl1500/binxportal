/**
 * page.tsx - Project Dashboard
 *
 * The project overview, as a per-user customizable widget grid (see
 * ProjectDashboardGrid): overview, my tasks, board, team, meetings, AI
 * status update, and files. Each staff member chooses which widgets show,
 * their order, and their width; that layout is theirs alone and follows them
 * to every project. Widgets are compact summaries that link to the tab owning
 * the full view (Board, Team, Files, …) rather than duplicating it here.
 *
 * Only the data for visible widgets is fetched — un-hiding one refreshes the
 * route. The [projectId] layout above already resolved (and 404-checked) the
 * project and renders the header/tabs; getAgencyProject is cache-deduped.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/page.tsx
 * @author Binx Portal
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getCurrentUser } from "@/lib/auth";
import { getMeetings } from "@/lib/meetings";
import {
  getAgencyProject,
  getProjectBoard,
  getProjectFiles,
  getProjectMembers,
} from "@/lib/projects";
import { getProjectDashboardLayout } from "@/lib/users";
import ScheduleMeetingDialog from "@/components/forms/meetings/ScheduleMeetingDialog/ScheduleMeetingDialog";
import UpcomingMeetingsCard from "@/components/meetings/UpcomingMeetingsCard/UpcomingMeetingsCard";
import AiProjectSummaryCard from "@/components/projects/AiProjectSummaryCard/AiProjectSummaryCard";
import ProjectDashboardGrid from "@/components/projects/ProjectDashboardGrid/ProjectDashboardGrid";
import {
  DEFAULT_HIDDEN_PROJECT_WIDGETS,
  DEFAULT_WIDE_PROJECT_WIDGETS,
  PROJECT_WIDGET_IDS,
  type ProjectWidgetId,
} from "@/components/projects/ProjectDashboardGrid/widgets";
import {
  BoardWidget,
  FilesWidget,
  MyTasksWidget,
  OverviewWidget,
  TeamWidget,
} from "@/components/projects/ProjectDashboardWidgets/ProjectDashboardWidgets";

import styles from "./page.module.scss";

interface ProjectDashboardPageProps {
  params: Promise<{ projectId: string }>;
}

const ProjectDashboardPage = async ({ params }: ProjectDashboardPageProps) => {
  const { projectId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  const agencyId = currentAgency.id;

  const [project, layout] = await Promise.all([
    getAgencyProject(agencyId, projectId),
    // A layout hiccup shouldn't take the whole page down — fall back to the defaults.
    getProjectDashboardLayout().catch(() => ({
      widget_order: [...PROJECT_WIDGET_IDS] as string[],
      hidden_widgets: DEFAULT_HIDDEN_PROJECT_WIDGETS as string[],
      wide_widgets: DEFAULT_WIDE_PROJECT_WIDGETS as string[],
    })),
  ]);

  const visible = new Set(
    PROJECT_WIDGET_IDS.filter((id) => !layout.hidden_widgets.includes(id)),
  );
  const needsBoard =
    visible.has("overview") || visible.has("board") || visible.has("my_tasks");

  const [board, members, files, meetings, user] = await Promise.all([
    needsBoard ? getProjectBoard(agencyId, projectId) : null,
    visible.has("team") ? getProjectMembers(agencyId, projectId) : null,
    visible.has("files") ? getProjectFiles(agencyId, projectId) : null,
    visible.has("meetings")
      ? getMeetings(agencyId, {
          projectId,
          status: "scheduled",
          fromDate: new Date().toISOString().slice(0, 10),
        })
      : null,
    visible.has("my_tasks") ? getCurrentUser() : null,
  ]);

  const widgets: Partial<Record<ProjectWidgetId, ReactNode>> = {};
  if (board) {
    widgets.overview = <OverviewWidget project={project} board={board} />;
    widgets.board = <BoardWidget board={board} />;
    if (visible.has("my_tasks")) {
      widgets.my_tasks = (
        <MyTasksWidget
          projectId={project.id}
          board={board}
          userId={user?.id ?? null}
        />
      );
    }
  }
  if (members) widgets.team = <TeamWidget members={members} />;
  if (files)
    widgets.files = <FilesWidget projectId={project.id} files={files} />;
  if (meetings) {
    widgets.meetings = (
      <UpcomingMeetingsCard
        meetings={meetings}
        limit={4}
        moreHref={`/clients/${project.client_id}/meetings`}
      />
    );
  }
  if (visible.has("ai_summary")) {
    widgets.ai_summary = (
      <AiProjectSummaryCard agencyId={agencyId} projectId={project.id} />
    );
  }

  const headerActions: Partial<Record<ProjectWidgetId, ReactNode>> = {
    overview: (
      <Link
        href={`/projects/${project.id}/settings`}
        className={styles.cardLink}
      >
        Edit details
      </Link>
    ),
    my_tasks: (
      <Link href="/dashboard/my-work" className={styles.cardLink}>
        All my work
      </Link>
    ),
    board: (
      <Link href={`/projects/${project.id}/board`} className={styles.cardLink}>
        Open board
      </Link>
    ),
    team: (
      <Link href={`/projects/${project.id}/team`} className={styles.cardLink}>
        Manage team
      </Link>
    ),
    meetings: (
      <ScheduleMeetingDialog
        agencyId={agencyId}
        clients={[{ id: project.client_id, name: project.client_name }]}
        projects={[
          { id: project.id, name: project.name, client_id: project.client_id },
        ]}
        defaultClientId={project.client_id}
        defaultProjectId={project.id}
        compact
      />
    ),
    files: (
      <Link href={`/projects/${project.id}/files`} className={styles.cardLink}>
        View files
      </Link>
    ),
  };

  return (
    <ProjectDashboardGrid
      initialOrder={layout.widget_order}
      initialHidden={layout.hidden_widgets}
      initialWide={layout.wide_widgets}
      widgets={widgets}
      headerActions={headerActions}
    />
  );
};

export default ProjectDashboardPage;

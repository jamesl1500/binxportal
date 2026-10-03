/**
 * ProjectDashboardWidgets.tsx
 *
 * The bodies of the project dashboard's widgets (see ProjectDashboardGrid,
 * which owns the card chrome and titles). Plain server-rendered markup — each
 * takes already-fetched data from the page and renders a compact summary
 * with a link to the tab that owns the full view, so the dashboard stays a
 * glanceable overview instead of a second copy of every tab.
 *
 * @module apps/binx-web/src/components/projects/ProjectDashboardWidgets/ProjectDashboardWidgets.tsx
 * @author Binx Portal
 */
import Link from "next/link";

import type {
  BoardColumn,
  Project,
  ProjectFile,
  ProjectMember,
  Task,
} from "@/lib/projects";

import styles from "./ProjectDashboardWidgets.module.scss";

const DAY_MS = 86_400_000;

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(iso: string): number {
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - start) / DAY_MS);
}

function dueLabel(iso: string): { text: string; overdue: boolean } {
  const days = daysUntil(iso);
  if (days < 0)
    return {
      text: `${-days} day${days === -1 ? "" : "s"} overdue`,
      overdue: true,
    };
  if (days === 0) return { text: "Due today", overdue: false };
  if (days === 1) return { text: "Due tomorrow", overdue: false };
  return { text: `Due in ${days} days`, overdue: false };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

/** Done = tasks in the board's last list, the same rule binx-api's My Work uses. */
export function boardProgress(board: BoardColumn[]): {
  done: number;
  total: number;
} {
  const total = board.reduce((sum, column) => sum + column.tasks.length, 0);
  const done = board.length > 0 ? board[board.length - 1].tasks.length : 0;
  return { done, total };
}

// ---- Overview ----

interface OverviewWidgetProps {
  project: Project;
  board: BoardColumn[];
}

export const OverviewWidget = ({ project, board }: OverviewWidgetProps) => {
  const { done, total } = boardProgress(board);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const due = project.due_date ? dueLabel(project.due_date) : null;

  return (
    <div className={styles.overview}>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Client</dt>
          <dd>
            <Link
              href={`/clients/${project.client_id}`}
              className={styles.inlineLink}
            >
              {project.client_name}
            </Link>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Timeline</dt>
          <dd>
            {project.start_date ? formatDate(project.start_date) : "No start"} →{" "}
            {project.due_date ? formatDate(project.due_date) : "No due date"}
          </dd>
        </div>
        {due && (
          <div className={styles.fact}>
            <dt>Deadline</dt>
            <dd data-overdue={due.overdue}>{due.text}</dd>
          </div>
        )}
        <div className={styles.fact}>
          <dt>Team</dt>
          <dd>
            {project.member_count}{" "}
            {project.member_count === 1 ? "person" : "people"}
          </dd>
        </div>
      </dl>

      <div className={styles.progress}>
        <div className={styles.progressLabel}>
          <span>Progress</span>
          <span>
            {total === 0
              ? "No tasks yet"
              : `${done} of ${total} tasks done · ${percent}%`}
          </span>
        </div>
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Tasks done"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span
            className={styles.progressFill}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}
    </div>
  );
};

// ---- My tasks ----

interface MyTasksWidgetProps {
  projectId: string;
  board: BoardColumn[];
  userId: string | null;
  limit?: number;
}

export const MyTasksWidget = ({
  projectId,
  board,
  userId,
  limit = 5,
}: MyTasksWidgetProps) => {
  // Everything but the last ("done") list, in board order, soonest due first.
  const open: Array<Task & { listName: string }> = board
    .slice(0, -1)
    .flatMap((column) =>
      column.tasks.map((task) => ({ ...task, listName: column.name })),
    )
    .filter((task) => userId !== null && task.assignee_id === userId)
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  if (open.length === 0) {
    return (
      <p className={styles.empty}>Nothing assigned to you here right now.</p>
    );
  }

  const shown = open.slice(0, limit);
  return (
    <>
      <ul className={styles.list}>
        {shown.map((task) => {
          const due = task.due_date ? dueLabel(task.due_date) : null;
          return (
            <li key={task.id} className={styles.listRow}>
              <Link
                href={`/projects/${projectId}/board`}
                className={styles.rowMain}
              >
                {task.title}
              </Link>
              <span
                className={styles.rowMeta}
                data-overdue={due?.overdue ?? false}
              >
                {due ? due.text : task.listName}
              </span>
            </li>
          );
        })}
      </ul>
      {open.length > shown.length && (
        <Link href={`/projects/${projectId}/board`} className={styles.more}>
          +{open.length - shown.length} more on the board
        </Link>
      )}
    </>
  );
};

// ---- Board ----

export const BoardWidget = ({ board }: { board: BoardColumn[] }) => {
  if (board.length === 0) {
    return <p className={styles.empty}>This board has no lists yet.</p>;
  }
  const max = Math.max(1, ...board.map((column) => column.tasks.length));

  return (
    <ul className={styles.list}>
      {board.map((column) => (
        <li key={column.id} className={styles.boardRow}>
          <span className={styles.boardName}>{column.name}</span>
          <span className={styles.boardBar} aria-hidden="true">
            <span style={{ width: `${(column.tasks.length / max) * 100}%` }} />
          </span>
          <span className={styles.boardCount}>{column.tasks.length}</span>
        </li>
      ))}
    </ul>
  );
};

// ---- Team ----

export const TeamWidget = ({
  members,
  limit = 6,
}: {
  members: ProjectMember[];
  limit?: number;
}) => {
  if (members.length === 0) {
    return (
      <p className={styles.empty}>No one is assigned to this project yet.</p>
    );
  }
  const shown = members.slice(0, limit);

  return (
    <>
      <ul className={styles.list}>
        {shown.map((member) => (
          <li key={member.id} className={styles.listRow}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(member.full_name)}
            </span>
            <span className={styles.rowMain}>{member.full_name}</span>
            {member.role_name ? (
              <span
                className={styles.roleChip}
                style={{
                  borderColor: member.role_color ?? undefined,
                  color: member.role_color ?? undefined,
                }}
              >
                {member.role_name}
              </span>
            ) : (
              <span className={styles.rowMeta}>No role</span>
            )}
          </li>
        ))}
      </ul>
      {members.length > shown.length && (
        <p className={styles.more}>+{members.length - shown.length} more</p>
      )}
    </>
  );
};

// ---- Files ----

export const FilesWidget = ({
  projectId,
  files,
  limit = 5,
}: {
  projectId: string;
  files: ProjectFile[];
  limit?: number;
}) => {
  if (files.length === 0) {
    return <p className={styles.empty}>No files yet.</p>;
  }
  const shown = files.slice(0, limit);

  return (
    <>
      <ul className={styles.list}>
        {shown.map((file) => (
          <li key={file.id} className={styles.listRow}>
            <span className={styles.rowMain}>{file.file_name}</span>
          </li>
        ))}
      </ul>
      {files.length > shown.length && (
        <Link href={`/projects/${projectId}/files`} className={styles.more}>
          +{files.length - shown.length} more
        </Link>
      )}
    </>
  );
};

/**
 * PortalTaskBoard.tsx
 *
 * A read-only view of the project's task board for a client — the same
 * columns the agency team works in on the staff Kanban board, without
 * editing (no drag, no assignees, no comments; binx-api already trims the
 * data to what's safe to show — see client_portal/schemas.py::PortalTaskRead).
 * Server component (static markup).
 *
 * @module apps/binx-web/src/components/portal/PortalTaskBoard/PortalTaskBoard.tsx
 * @author Binx.io
 */
import type { PortalTaskList } from "@/lib/portal";

import styles from "./PortalTaskBoard.module.scss";

interface PortalTaskBoardProps {
  columns: PortalTaskList[];
}

function formatDueDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const PortalTaskBoard = ({ columns }: PortalTaskBoardProps) => {
  if (columns.every((column) => column.tasks.length === 0)) {
    return <p className={styles.empty}>No tasks yet.</p>;
  }

  return (
    <div className={styles.board}>
      {columns.map((column) => (
        <div key={column.id} className={styles.column}>
          <div className={styles.columnHead}>
            <span className={styles.columnName}>{column.name}</span>
            <span className={styles.columnCount}>{column.tasks.length}</span>
          </div>

          <ul className={styles.taskList}>
            {column.tasks.map((task) => (
              <li key={task.id} className={styles.task}>
                <p className={styles.taskTitle}>{task.title}</p>
                {task.description && <p className={styles.taskDescription}>{task.description}</p>}
                {task.due_date && <span className={styles.taskDueDate}>Due {formatDueDate(task.due_date)}</span>}
              </li>
            ))}
            {column.tasks.length === 0 && <li className={styles.emptyColumn}>Nothing here yet</li>}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default PortalTaskBoard;

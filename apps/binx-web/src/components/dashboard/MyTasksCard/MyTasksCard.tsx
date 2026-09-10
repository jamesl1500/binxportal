/**
 * MyTasksCard.tsx
 *
 * The signed-in member's assigned, not-done tasks — grouped loosely by
 * urgency (overdue → due soon → the rest), each linking to its project
 * board. Server component: static markup from the `/my-work` rollup.
 *
 * @module apps/binx-web/src/components/dashboard/MyTasksCard/MyTasksCard.tsx
 * @author Binx.io
 */
import Link from "next/link";

import type { MyTask } from "@/lib/dashboard";

import styles from "./MyTasksCard.module.scss";

interface MyTasksCardProps {
  tasks: MyTask[];
  /** Cap the list; a "+N more" line links to the full My work tab. */
  limit?: number;
}

function dueLabel(task: MyTask): string {
  if (!task.due_date) return "No due date";
  const due = new Date(`${task.due_date}T00:00:00`);
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (task.overdue) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days}d`;
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const MyTasksCard = ({ tasks, limit }: MyTasksCardProps) => {
  if (tasks.length === 0) {
    return <p className={styles.empty}>Nothing assigned to you right now. 🎉</p>;
  }

  const shown = limit ? tasks.slice(0, limit) : tasks;
  const remaining = limit ? tasks.length - shown.length : 0;

  return (
    <div className={styles.wrap}>
      <ul className={styles.list}>
        {shown.map((task) => (
          <li key={task.id}>
            <Link href={`/projects/${task.project_id}/board`} className={styles.row} data-overdue={task.overdue}>
              <span className={styles.title}>{task.title}</span>
              <span className={styles.meta}>
                {task.project_name} · {task.list_name}
              </span>
              <span className={styles.due} data-overdue={task.overdue}>
                {dueLabel(task)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <Link href="/dashboard/my-work" className={styles.more}>
          +{remaining} more
        </Link>
      )}
    </div>
  );
};

export default MyTasksCard;

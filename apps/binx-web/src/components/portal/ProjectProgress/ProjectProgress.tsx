/**
 * ProjectProgress.tsx
 *
 * A read-only progress bar for a client-portal project — done tasks over
 * total, with an optional per-column breakdown. Server component (static
 * markup); the numbers come from binx-api's portal project rollup.
 *
 * @module apps/binx-web/src/components/portal/ProjectProgress/ProjectProgress.tsx
 * @author Binx.io
 */
import type { PortalBoardColumn, PortalProgress } from "@/lib/portal";

import styles from "./ProjectProgress.module.scss";

interface ProjectProgressProps {
  progress: PortalProgress;
  columns?: PortalBoardColumn[];
  /** Slim single-line variant for list rows. */
  compact?: boolean;
}

const ProjectProgress = ({ progress, columns, compact }: ProjectProgressProps) => {
  return (
    <div className={styles.wrap} data-compact={Boolean(compact)}>
      <div className={styles.bar} role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
        <span className={styles.fill} style={{ width: `${progress.percent}%` }} />
      </div>
      <p className={styles.caption}>
        {progress.done_tasks} / {progress.total_tasks} tasks done · {progress.percent}%
      </p>

      {columns && columns.length > 0 && (
        <ul className={styles.columns}>
          {columns.map((column) => (
            <li key={column.name} className={styles.column}>
              <span className={styles.columnName}>{column.name}</span>
              <span className={styles.columnCount}>{column.task_count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProjectProgress;

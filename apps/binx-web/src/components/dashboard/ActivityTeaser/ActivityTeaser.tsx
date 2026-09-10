/**
 * ActivityTeaser.tsx
 *
 * A compact, read-only slice of the agency activity feed for the dashboard —
 * the latest few entries with an actor initial, the summary sentence, and a
 * relative timestamp. The full feed (filters, pagination) lives at /activity.
 *
 * @module apps/binx-web/src/components/dashboard/ActivityTeaser/ActivityTeaser.tsx
 * @author Binx.io
 */
import type { ActivityEntry } from "@/lib/activity";
import { relativeTime } from "@/lib/notifications-client";

import styles from "./ActivityTeaser.module.scss";

interface ActivityTeaserProps {
  entries: ActivityEntry[];
}

function initials(name: string | null): string {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const ActivityTeaser = ({ entries }: ActivityTeaserProps) => {
  if (entries.length === 0) {
    return <p className={styles.empty}>No activity yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.row}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(entry.actor_name)}
          </span>
          <div className={styles.body}>
            <p className={styles.summary}>{entry.summary}</p>
            <span className={styles.time}>{relativeTime(entry.created_at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default ActivityTeaser;

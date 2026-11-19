/**
 * AuditTimeline.tsx
 *
 * What the Binx team has done to an agency or user (or, on /admin/audit,
 * to anyone): the action, its detail or note text, who did it and when.
 * `showTarget` adds a link to the affected agency/user for the global log.
 *
 * @module apps/binx-web/src/components/admin/AuditTimeline/AuditTimeline.tsx
 * @author Binx Portal
 */
import Link from "next/link";

import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import {
  auditActionLabel,
  auditTargetHref,
  type AuditEntry,
} from "@/lib/admin-client";

import styles from "./AuditTimeline.module.scss";

interface AuditTimelineProps {
  entries: AuditEntry[];
  showTarget?: boolean;
  emptyText?: string;
}

const AuditTimeline = ({
  entries,
  showTarget = false,
  emptyText = "No support activity yet.",
}: AuditTimelineProps) => {
  if (entries.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }
  return (
    <ol className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.id} className={styles.entry} data-action={entry.action}>
          <div className={styles.top}>
            <span className={styles.action}>
              {auditActionLabel(entry.action)}
            </span>
            {showTarget && (
              <Link href={auditTargetHref(entry)} className={styles.target}>
                {entry.target_label}
              </Link>
            )}
            <FeedbackDate
              iso={entry.created_at}
              withTime
              className={styles.date}
            />
          </div>
          {entry.detail && <p className={styles.detail}>{entry.detail}</p>}
          <span className={styles.actor}>by {entry.actor_name}</span>
        </li>
      ))}
    </ol>
  );
};

export default AuditTimeline;

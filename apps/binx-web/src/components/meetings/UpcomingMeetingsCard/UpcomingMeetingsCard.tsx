/**
 * UpcomingMeetingsCard.tsx
 *
 * A compact list of upcoming, still-scheduled meetings — reused on the
 * dashboard overview (agency-wide), the client dashboard (that client's
 * meetings), and the project overview (that project's meetings). Same
 * shape as MyTasksCard: server component, static markup, a capped list with
 * a "+N more" link to the fuller view. Callers pass already-filtered,
 * already-sorted meetings — this component doesn't fetch or filter.
 *
 * @module apps/binx-web/src/components/meetings/UpcomingMeetingsCard/UpcomingMeetingsCard.tsx
 * @author Binx.io
 */
import Link from "next/link";

import type { Meeting } from "@/lib/meetings";

import styles from "./UpcomingMeetingsCard.module.scss";

interface UpcomingMeetingsCardProps {
  meetings: Meeting[];
  /** Cap the list; a "+N more" line links to `moreHref`. */
  limit?: number;
  /** Where the "+N more" link (and each row) points. */
  moreHref: string;
  /** Show the client name in the meta line — the dashboard and project cards need it, the client card doesn't (redundant there). */
  showClient?: boolean;
  /** Show the project name in the meta line — the dashboard and client cards need it, the project card doesn't. */
  showProject?: boolean;
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function whenLabel(iso: string): string {
  const date = new Date(iso);
  const days = Math.round((startOfLocalDay(date) - startOfLocalDay(new Date())) / 86_400_000);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days > 1 && days <= 6) {
    return `${date.toLocaleDateString(undefined, { weekday: "long" })}, ${time}`;
  }
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

const UpcomingMeetingsCard = ({
  meetings,
  limit,
  moreHref,
  showClient = false,
  showProject = false,
}: UpcomingMeetingsCardProps) => {
  if (meetings.length === 0) {
    return <p className={styles.empty}>No upcoming meetings.</p>;
  }

  const shown = limit ? meetings.slice(0, limit) : meetings;
  const remaining = limit ? meetings.length - shown.length : 0;

  return (
    <div className={styles.wrap}>
      <ul className={styles.list}>
        {shown.map((meeting) => {
          const meta = [showClient ? meeting.client_name : null, showProject ? meeting.project_name : null].filter(
            Boolean,
          );
          return (
            <li key={meeting.id}>
              <Link href={moreHref} className={styles.row}>
                <span className={styles.title}>{meeting.title}</span>
                {meta.length > 0 && <span className={styles.meta}>{meta.join(" · ")}</span>}
                <span className={styles.when}>{whenLabel(meeting.starts_at)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <Link href={moreHref} className={styles.more}>
          +{remaining} more
        </Link>
      )}
    </div>
  );
};

export default UpcomingMeetingsCard;

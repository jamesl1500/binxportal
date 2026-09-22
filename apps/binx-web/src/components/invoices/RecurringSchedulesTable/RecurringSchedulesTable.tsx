/**
 * RecurringSchedulesTable.tsx
 *
 * The list of an agency's recurring-invoice (retainer) schedules: title,
 * client, a plain-English cadence ("Monthly on the 15th" / "Weekly on
 * Friday"), next run date, estimated amount, an active/paused badge, and
 * per-row actions (see `RecurringScheduleActions`).
 *
 * @module apps/binx-web/src/components/invoices/RecurringSchedulesTable/RecurringSchedulesTable.tsx
 * @author Binx.io
 */
"use client";

import { formatMoneyCents } from "@/lib/money";
import type { RecurringSchedule } from "@/lib/recurring-invoices";
import { recurringIntervalLabel, weekdayLabel } from "@/lib/recurring-invoices-client";
import RecurringScheduleActions from "@/components/invoices/RecurringScheduleActions/RecurringScheduleActions";

import styles from "./RecurringSchedulesTable.module.scss";

interface RecurringSchedulesTableProps {
  agencyId: string;
  schedules: RecurringSchedule[];
  currency: string;
  /** Owner/admin only — gates pause/resume/run-now/delete. */
  canManage: boolean;
}

function ordinal(day: number): string {
  const remainder = day % 100;
  if (remainder >= 11 && remainder <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** e.g. "Monthly on the 15th", "Every 2 weeks on Friday". */
export function cadenceLabel(schedule: RecurringSchedule): string {
  const every = schedule.interval_count > 1 ? `Every ${schedule.interval_count} ` : "";
  if (schedule.interval === "monthly") {
    const plural = schedule.interval_count > 1 ? "months" : "";
    const base = every ? `${every}${plural}` : recurringIntervalLabel(schedule.interval);
    return schedule.day_of_month != null ? `${base} on the ${ordinal(schedule.day_of_month)}` : base;
  }
  if (schedule.interval === "weekly") {
    const plural = schedule.interval_count > 1 ? "weeks" : "";
    const base = every ? `${every}${plural}` : recurringIntervalLabel(schedule.interval);
    return schedule.weekday != null ? `${base} on ${weekdayLabel(schedule.weekday)}` : base;
  }
  return recurringIntervalLabel(schedule.interval);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const RecurringSchedulesTable = ({ agencyId, schedules, currency, canManage }: RecurringSchedulesTableProps) => {
  if (schedules.length === 0) {
    return <p className={styles.empty}>No recurring invoices yet.</p>;
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.headCell}>Title</th>
            <th className={styles.headCell}>Client</th>
            <th className={styles.headCell}>Cadence</th>
            <th className={styles.headCell}>Next run</th>
            <th className={styles.headCell}>Est. amount</th>
            <th className={styles.headCell}>Status</th>
            <th className={styles.headCell} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {schedules.map((schedule) => (
            <tr key={schedule.id} className={styles.row}>
              <td className={styles.cell}>
                <span className={styles.title}>{schedule.title}</span>
                {schedule.project_name && <span className={styles.subtitle}>{schedule.project_name}</span>}
              </td>
              <td className={styles.cell}>{schedule.client_name}</td>
              <td className={styles.cell}>{cadenceLabel(schedule)}</td>
              <td className={`${styles.cell} ${styles.nowrap}`}>{formatDate(schedule.next_run_date)}</td>
              <td className={`${styles.cell} ${styles.amount}`}>
                {formatMoneyCents(schedule.estimated_amount_cents, currency)}
              </td>
              <td className={styles.cell}>
                <span className={styles.status} data-active={schedule.is_active}>
                  {schedule.is_active ? "Active" : "Paused"}
                </span>
              </td>
              <td className={`${styles.cell} ${styles.actionsCell}`}>
                <RecurringScheduleActions agencyId={agencyId} schedule={schedule} canManage={canManage} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RecurringSchedulesTable;

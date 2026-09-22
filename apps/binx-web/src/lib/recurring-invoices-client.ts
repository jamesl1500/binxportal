/**
 * recurring-invoices-client.ts
 *
 * Client-safe slice of the recurring-invoices data layer: just the
 * interval/weekday display labels. Kept out of `lib/recurring-invoices.ts`
 * so Client Components (the schedule form, the schedules table) can import
 * them without dragging in `next/headers` via `lib/auth.ts` — same
 * reasoning as `lib/leads-client.ts`.
 *
 * @module apps/binx-web/src/lib/recurring-invoices-client.ts
 * @author Binx.io
 */

export const RECURRING_INTERVAL_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
};

export function recurringIntervalLabel(interval: string): string {
  return RECURRING_INTERVAL_LABELS[interval] ?? interval;
}

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? String(weekday);
}

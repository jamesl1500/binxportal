/**
 * admin-errors-client.ts
 *
 * Client-safe types, labels and formatting for the admin error dashboard
 * (`/admin/errors`), shared by the server pages and the interactive status
 * buttons. Server-only fetchers live in `lib/admin-errors.ts`; binx-api's
 * side is `modules/errors`.
 *
 * @module apps/binx-web/src/lib/admin-errors-client.ts
 * @author Binx Portal
 */

export type ErrorSource = "api" | "web";
export type IssueStatus = "unresolved" | "resolved" | "ignored";
export type IssuePeriod = "1h" | "12h" | "24h" | "7d" | "30d";
export type IssueSort = "frequent" | "recent" | "new";

export interface WindowCounts {
  events: number;
  issues: number;
  users: number;
}

export interface HourBucket {
  hour_start: string;
  api: number;
  web: number;
  total: number;
}

export interface ErrorSummary {
  generated_at: string;
  windows: Record<"1h" | "12h" | "24h", WindowCounts>;
  previous_24h: number;
  by_source_24h: Record<ErrorSource, number>;
  open_issues_24h: number;
  new_issues_24h: number;
  hourly: HourBucket[];
}

export interface ErrorIssueRow {
  id: string;
  source: ErrorSource;
  level: string;
  error_type: string;
  title: string;
  culprit: string | null;
  status: IssueStatus;
  first_seen_at: string;
  last_seen_at: string;
  event_count: number;
  events_in_period: number;
  users_in_period: number;
  last_release: string | null;
  regressed_at: string | null;
  sentry_url: string | null;
}

export interface ErrorEventRow {
  id: string;
  reference: string;
  created_at: string;
  source: ErrorSource;
  level: string;
  error_type: string;
  message: string;
  request_id: string | null;
  method: string | null;
  path: string | null;
  route: string | null;
  status_code: number | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  agency_id: string | null;
  release: string | null;
  environment: string | null;
  sentry_url: string | null;
}

export interface ErrorEventFull extends ErrorEventRow {
  stacktrace: string | null;
  context: Record<string, unknown> | null;
}

export interface ErrorIssueDetail {
  issue: ErrorIssueRow;
  status_changed_by_name: string | null;
  resolved_at: string | null;
  hourly: HourBucket[];
  recent_events: ErrorEventRow[];
  event: ErrorEventFull | null;
}

export const WINDOW_LABELS: { key: "1h" | "12h" | "24h"; label: string }[] = [
  { key: "1h", label: "Last hour" },
  { key: "12h", label: "Last 12 hours" },
  { key: "24h", label: "Last 24 hours" },
];

export const PERIOD_OPTIONS: { value: IssuePeriod; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "12h", label: "12 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export const SORT_OPTIONS: { value: IssueSort; label: string }[] = [
  { value: "frequent", label: "Most frequent" },
  { value: "recent", label: "Latest" },
  { value: "new", label: "Newest" },
];

export const STATUS_OPTIONS: {
  value: IssueStatus | undefined;
  label: string;
}[] = [
  { value: "unresolved", label: "Unresolved" },
  { value: "resolved", label: "Resolved" },
  { value: "ignored", label: "Ignored" },
  { value: undefined, label: "All" },
];

export const SOURCE_LABELS: Record<ErrorSource, string> = {
  api: "API",
  web: "Web",
};

export const STATUS_LABELS: Record<IssueStatus, string> = {
  unresolved: "Unresolved",
  resolved: "Resolved",
  ignored: "Ignored",
};

export const STATUS_TONES: Record<IssueStatus, "bad" | "good" | undefined> = {
  unresolved: "bad",
  resolved: "good",
  ignored: undefined,
};

export function isPeriod(value: string | undefined): value is IssuePeriod {
  return PERIOD_OPTIONS.some((option) => option.value === value);
}

export function isSort(value: string | undefined): value is IssueSort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

export function isStatus(value: string | undefined): value is IssueStatus {
  return value === "unresolved" || value === "resolved" || value === "ignored";
}

export function isSource(value: string | undefined): value is ErrorSource {
  return value === "api" || value === "web";
}

/** "14:00" for an hour bucket, in UTC. The chart is server-rendered, so a
 * fixed zone keeps it the same for everyone; the card says it's UTC. */
export function hourLabel(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getUTCHours()).padStart(2, "0")}:00`;
}

/** The change from the previous 24 hours, as a sentence fragment. */
export function trendLabel(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? "None the day before either" : "None the day before";
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return "Same as the day before";
  return `${change > 0 ? "+" : "−"}${Math.abs(change)}% on the day before`;
}

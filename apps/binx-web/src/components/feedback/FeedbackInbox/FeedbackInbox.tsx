/**
 * FeedbackInbox.tsx
 *
 * The Binx team's triage list (`/admin/feedback`): summary tiles, status
 * tabs, kind/surface/search filters, and one row per item linking to its
 * detail page. Server-rendered — the filters are a plain GET form and links,
 * so the page state lives in the URL and is shareable within the team.
 *
 * @module apps/binx-web/src/components/feedback/FeedbackInbox/FeedbackInbox.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import { Star } from "lucide-react";

import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import FeedbackStatusBadge from "@/components/feedback/FeedbackStatusBadge/FeedbackStatusBadge";
import type { FeedbackAdminPage } from "@/lib/feedback";
import {
  FEEDBACK_ADMIN_STATUS_LABEL,
  type FeedbackAdminFilter,
  FEEDBACK_KIND_SHORT,
  FEEDBACK_STATUSES,
  type FeedbackSummary,
  type StoredFeedbackKind,
} from "@/lib/feedback-client";

import styles from "./FeedbackInbox.module.scss";

export const INBOX_PAGE_SIZE = 25;

const KIND_OPTIONS: StoredFeedbackKind[] = [
  "bug",
  "idea",
  "praise",
  "other",
  "pulse",
];

function excerpt(text: string, limit = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * The inbox URL for a filter, dropping empty params. "Open" is the default
 * view, so it has no param; no status at all (everything) is `status=all`.
 */
export function inboxHref(filter: FeedbackAdminFilter): string {
  const params = new URLSearchParams();
  if (!filter.status) params.set("status", "all");
  else if (filter.status !== "open") params.set("status", filter.status);
  if (filter.kind) params.set("kind", filter.kind);
  if (filter.surface) params.set("surface", filter.surface);
  if (filter.q) params.set("q", filter.q);
  if (filter.offset) params.set("offset", String(filter.offset));
  const query = params.toString();
  return query ? `/admin/feedback?${query}` : "/admin/feedback";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function rating(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

interface FeedbackInboxProps {
  page: FeedbackAdminPage;
  summary: FeedbackSummary;
  filter: FeedbackAdminFilter;
}

const FeedbackInbox = ({ page, summary, filter }: FeedbackInboxProps) => {
  const pulseShown = summary.pulse_answered + summary.pulse_dismissed;
  const answerRate =
    pulseShown > 0
      ? Math.round((summary.pulse_answered / pulseShown) * 100)
      : null;
  const offset = filter.offset ?? 0;
  const statusTabs: {
    value: FeedbackAdminFilter["status"];
    label: string;
    count?: number;
  }[] = [
    { value: "open", label: "Open", count: summary.open_total },
    ...FEEDBACK_STATUSES.map((status) => ({
      value: status,
      label: FEEDBACK_ADMIN_STATUS_LABEL[status],
      count: summary.by_status[status] ?? 0,
    })),
    { value: undefined, label: "All" },
  ];

  return (
    <div className={styles.inbox}>
      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt>Open</dt>
          <dd>{summary.open_total}</dd>
          <span className={styles.tileHint}>
            {summary.by_status.new ?? 0} not yet looked at
          </span>
        </div>
        <div className={styles.tile}>
          <dt>Avg rating · 30 days</dt>
          <dd>{rating(summary.avg_rating_30d)}</dd>
          <span className={styles.tileHint}>
            from {summary.rated_30d} rated{" "}
            {summary.rated_30d === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className={styles.tile}>
          <dt>Check-in score</dt>
          <dd>{rating(summary.pulse_avg_rating)}</dd>
          <span className={styles.tileHint}>
            {answerRate === null
              ? "no check-ins yet"
              : `${answerRate}% answered (${summary.pulse_answered} of ${pulseShown})`}
          </span>
        </div>
        <div className={styles.tile}>
          <dt>By surface</dt>
          <dd className={styles.split}>
            <span>{summary.by_surface.app ?? 0} app</span>
            <span>{summary.by_surface.portal ?? 0} portal</span>
          </dd>
          <span className={styles.tileHint}>
            {plural(summary.by_kind.bug ?? 0, "bug")} ·{" "}
            {plural(summary.by_kind.idea ?? 0, "idea")}
          </span>
        </div>
      </dl>

      <nav className={styles.tabs} aria-label="Filter by status">
        {statusTabs.map((tab) => {
          const active = filter.status === tab.value;
          return (
            <Link
              key={tab.label}
              href={inboxHref({ ...filter, status: tab.value, offset: 0 })}
              className={styles.tab}
              data-active={active}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={styles.tabCount}>{tab.count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <form className={styles.filters} action="/admin/feedback" method="get">
        {filter.status !== "open" && (
          <input type="hidden" name="status" value={filter.status ?? "all"} />
        )}
        <label className={styles.filter}>
          <span>Kind</span>
          <select
            name="kind"
            defaultValue={filter.kind ?? ""}
            className={styles.select}
          >
            <option value="">Any kind</option>
            {KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {FEEDBACK_KIND_SHORT[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filter}>
          <span>From</span>
          <select
            name="surface"
            defaultValue={filter.surface ?? ""}
            className={styles.select}
          >
            <option value="">App + portal</option>
            <option value="app">Agency app</option>
            <option value="portal">Client portal</option>
          </select>
        </label>
        <label className={`${styles.filter} ${styles.search}`}>
          <span>Search</span>
          <input
            type="search"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="Message, name or email"
            className={styles.input}
          />
        </label>
        <button type="submit" className={styles.apply}>
          Apply
        </button>
      </form>

      {page.items.length === 0 ? (
        <p className={styles.empty}>Nothing matches these filters.</p>
      ) : (
        <ul className={styles.list}>
          {page.items.map((item) => (
            <li key={item.id}>
              <Link href={`/admin/feedback/${item.id}`} className={styles.row}>
                <div className={styles.rowTop}>
                  <span className={styles.kind} data-kind={item.kind}>
                    {FEEDBACK_KIND_SHORT[item.kind]}
                  </span>
                  <FeedbackStatusBadge status={item.status} variant="admin" />
                  {item.rating !== null && (
                    <span
                      className={styles.rating}
                      aria-label={`Rated ${item.rating} of 5`}
                    >
                      <Star aria-hidden="true" />
                      {item.rating}
                    </span>
                  )}
                  {item.response && (
                    <span className={styles.replied}>Replied</span>
                  )}
                  <FeedbackDate iso={item.created_at} className={styles.date} />
                </div>
                <p className={styles.message}>
                  {item.message ? excerpt(item.message) : <em>Rating only</em>}
                </p>
                <p className={styles.who}>
                  {item.user_name}
                  <span aria-hidden="true"> · </span>
                  {item.surface === "portal"
                    ? `Client of ${item.agency_name ?? "an agency"}${item.client_name ? ` (${item.client_name})` : ""}`
                    : (item.agency_name ?? "No agency")}
                  {item.page_path && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <code>{item.page_path}</code>
                    </>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page.total > INBOX_PAGE_SIZE && (
        <nav className={styles.pager} aria-label="Pages">
          {offset > 0 ? (
            <Link
              href={inboxHref({
                ...filter,
                offset: Math.max(0, offset - INBOX_PAGE_SIZE),
              })}
              className={styles.pageLink}
            >
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className={styles.pageInfo}>
            {offset + 1}–{Math.min(offset + INBOX_PAGE_SIZE, page.total)} of{" "}
            {page.total}
          </span>
          {offset + INBOX_PAGE_SIZE < page.total ? (
            <Link
              href={inboxHref({ ...filter, offset: offset + INBOX_PAGE_SIZE })}
              className={styles.pageLink}
            >
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
};

export default FeedbackInbox;

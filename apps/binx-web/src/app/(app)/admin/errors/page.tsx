/**
 * page.tsx - Errors (Binx team)
 *
 * Every unexpected error across binx-api and binx-web: errors in the last
 * hour, 12 hours and 24 hours, errors per hour, and the issues behind them,
 * grouped, sorted, and filterable by status, source and period. A reference
 * a customer quotes ("7F3A9C21", or a request id) jumps straight to that
 * occurrence. The filters live in the URL. Platform admins only (the admin
 * layout); binx-api enforces the same on `/admin/errors/*`.
 *
 * @module apps/binx-web/src/app/(app)/admin/errors/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ERROR_PAGE_SIZE,
  getErrorIssues,
  getErrorSummary,
  lookupErrorReference,
} from "@/lib/admin-errors";
import {
  isPeriod,
  isSort,
  isSource,
  isStatus,
  PERIOD_OPTIONS,
  SORT_OPTIONS,
  SOURCE_LABELS,
  STATUS_OPTIONS,
  type IssueStatus,
} from "@/lib/admin-errors-client";
import { adminHref, parseOffset } from "@/lib/admin-client";
import AdminPager from "@/components/admin/AdminPager/AdminPager";
import ErrorDashboard from "@/components/admin/ErrorDashboard/ErrorDashboard";
import { ErrorIssuePills } from "@/components/admin/ErrorIssuePills/ErrorIssuePills";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import ui from "@/components/admin/adminUi.module.scss";

export const metadata: Metadata = { title: "Errors · Admin" };

interface ErrorsPageProps {
  searchParams: Promise<{
    status?: string;
    source?: string;
    period?: string;
    sort?: string;
    q?: string;
    ref?: string;
    offset?: string;
  }>;
}

const ErrorsPage = async ({ searchParams }: ErrorsPageProps) => {
  const params = await searchParams;

  const ref = params.ref?.trim().slice(0, 64);
  let refMissing = false;
  if (ref) {
    const found = await lookupErrorReference(ref);
    if (found) {
      redirect(`/admin/errors/${found.issue_id}?event=${found.event_id}`);
    }
    refMissing = true;
  }

  // No status in the URL means the default view, unresolved. "all" turns
  // the filter off.
  const status: IssueStatus | undefined =
    params.status === "all"
      ? undefined
      : isStatus(params.status)
        ? params.status
        : "unresolved";
  const source = isSource(params.source) ? params.source : undefined;
  const period = isPeriod(params.period) ? params.period : "24h";
  const sort = isSort(params.sort) ? params.sort : "frequent";
  const q = params.q?.trim().slice(0, 200) || undefined;
  const offset = parseOffset(params.offset);

  const [summary, page] = await Promise.all([
    getErrorSummary(),
    getErrorIssues({ status, source, period, sort, q, offset }),
  ]);

  const href = (overrides: Record<string, string | number | undefined>) =>
    adminHref("/admin/errors", {
      status: status === "unresolved" ? undefined : (status ?? "all"),
      source,
      period: period === "24h" ? undefined : period,
      sort: sort === "frequent" ? undefined : sort,
      q,
      offset: 0,
      ...overrides,
    });
  const periodLabel =
    PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? period;

  return (
    <div>
      <span className={ui.eyebrow}>Binx team</span>
      <h1 className={ui.title}>Errors</h1>
      <p className={ui.subtitle}>
        Unexpected errors from the API and the web app, grouped into issues.
        Sentry has the same events for deeper debugging.
      </p>

      <div className={ui.body}>
        <form
          className={ui.filters}
          action="/admin/errors"
          method="get"
          role="search"
          aria-label="Find an error by reference"
        >
          <label className={`${ui.field} ${ui.grow}`}>
            Reference or request id
            <input
              type="search"
              name="ref"
              defaultValue={ref ?? ""}
              className={ui.input}
              placeholder="e.g. 7F3A9C21, from a customer's error message"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <button type="submit" className={ui.button}>
            Find
          </button>
        </form>
        {refMissing && (
          <p className={ui.error} role="alert">
            No error matches &ldquo;{ref}&rdquo;. Occurrences are kept for 30
            days.
          </p>
        )}

        <ErrorDashboard summary={summary} />

        <nav className={ui.chips} aria-label="Filter by status">
          {STATUS_OPTIONS.map((option) => (
            <Link
              key={option.label}
              href={href({
                status:
                  option.value === "unresolved"
                    ? undefined
                    : (option.value ?? "all"),
              })}
              className={ui.chip}
              data-active={status === option.value}
            >
              {option.label}
            </Link>
          ))}
        </nav>
        <nav className={ui.chips} aria-label="Filter by source">
          <Link
            href={href({ source: undefined })}
            className={ui.chip}
            data-active={!source}
          >
            API and web
          </Link>
          {(["api", "web"] as const).map((value) => (
            <Link
              key={value}
              href={href({ source: value })}
              className={ui.chip}
              data-active={source === value}
            >
              {SOURCE_LABELS[value]}
            </Link>
          ))}
        </nav>
        <nav className={ui.chips} aria-label="Seen in the last">
          {PERIOD_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={href({
                period: option.value === "24h" ? undefined : option.value,
              })}
              className={ui.chip}
              data-active={period === option.value}
            >
              {option.label}
            </Link>
          ))}
        </nav>

        <form
          className={ui.filters}
          action="/admin/errors"
          method="get"
          role="search"
          aria-label="Search issues"
        >
          {status !== "unresolved" && (
            <input type="hidden" name="status" value={status ?? "all"} />
          )}
          {source && <input type="hidden" name="source" value={source} />}
          {period !== "24h" && (
            <input type="hidden" name="period" value={period} />
          )}
          <label className={`${ui.field} ${ui.grow}`}>
            Search
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              className={ui.input}
              placeholder="Message, error type or where it happened"
            />
          </label>
          <label className={ui.field}>
            Sort
            <select name="sort" defaultValue={sort} className={ui.select}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={ui.button}>
            Apply
          </button>
        </form>

        <section className={ui.card}>
          <div className={ui.cardHeader}>
            <h2 className={ui.cardTitle}>
              {page.total.toLocaleString()}{" "}
              {page.total === 1 ? "issue" : "issues"}
            </h2>
            <span className={ui.meta}>Seen in the last {periodLabel}</span>
          </div>
          {page.items.length === 0 ? (
            <p className={ui.empty}>
              {status === "unresolved" && !q && !source
                ? `Nothing unresolved in the last ${periodLabel}.`
                : "No issues match."}
            </p>
          ) : (
            <div className={ui.tableScroll}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">Issue</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={ui.num}>
                      Events
                    </th>
                    <th scope="col" className={ui.num}>
                      People
                    </th>
                    <th scope="col">Last seen</th>
                    <th scope="col">First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((issue) => (
                    <tr key={issue.id}>
                      <td>
                        <Link
                          href={`/admin/errors/${issue.id}`}
                          className={`${ui.link} ${ui.strong}`}
                        >
                          {issue.error_type}
                        </Link>
                        <span className={ui.sub}>{issue.title}</span>
                        {issue.culprit && (
                          <span className={ui.sub}>
                            <code>{issue.culprit}</code>
                          </span>
                        )}
                      </td>
                      <td>
                        <ErrorIssuePills issue={issue} />
                      </td>
                      <td className={ui.num}>
                        {issue.events_in_period.toLocaleString()}
                        <span className={ui.sub}>
                          {issue.event_count.toLocaleString()} total
                        </span>
                      </td>
                      <td className={ui.num}>{issue.users_in_period}</td>
                      <td>
                        <FeedbackDate iso={issue.last_seen_at} withTime />
                      </td>
                      <td>
                        <FeedbackDate iso={issue.first_seen_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <AdminPager
          total={page.total}
          offset={offset}
          pageSize={ERROR_PAGE_SIZE}
          hrefFor={(next) => href({ offset: next })}
        />
      </div>
    </div>
  );
};

export default ErrorsPage;

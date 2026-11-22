/**
 * page.tsx - Error issue (Binx team)
 *
 * One error issue: what it is and where, its last 24 hours, the latest
 * occurrences (who, which page or endpoint, which release), and one
 * occurrence in full with its stack trace (the latest, or the one picked
 * with `?event=`). Resolve, ignore or reopen it, or open the same event in
 * Sentry. Platform admins only (the admin layout).
 *
 * @module apps/binx-web/src/app/(app)/admin/errors/[issueId]/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { getErrorIssue } from "@/lib/admin-errors";
import { hourLabel, SOURCE_LABELS } from "@/lib/admin-errors-client";
import { AuthApiError } from "@/lib/auth";
import BarChart from "@/components/charts/BarChart/BarChart";
import { ErrorIssuePills } from "@/components/admin/ErrorIssuePills/ErrorIssuePills";
import ErrorStatusActions from "@/components/admin/ErrorStatusActions/ErrorStatusActions";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import ui from "@/components/admin/adminUi.module.scss";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Error · Admin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ErrorIssuePageProps {
  params: Promise<{ issueId: string }>;
  searchParams: Promise<{ event?: string }>;
}

const ErrorIssuePage = async ({
  params,
  searchParams,
}: ErrorIssuePageProps) => {
  const { issueId } = await params;
  const { event: eventParam } = await searchParams;
  if (!UUID.test(issueId)) notFound();
  const eventId = eventParam && UUID.test(eventParam) ? eventParam : undefined;

  const detail = await getErrorIssue(issueId, eventId).catch((error) => {
    if (error instanceof AuthApiError && error.status === 404) notFound();
    throw error;
  });
  const { issue, event } = detail;
  const chart = detail.hourly.map((hour) => ({
    label: hourLabel(hour.hour_start),
    value: hour.total,
  }));

  return (
    <div>
      <Link href="/admin/errors" className={ui.back}>
        ← Errors
      </Link>
      <span className={ui.eyebrow}>{SOURCE_LABELS[issue.source]} error</span>
      <h1 className={`${ui.title} ${styles.title}`}>{issue.error_type}</h1>
      <p className={`${ui.subtitle} ${styles.message}`}>{issue.title}</p>

      <div className={ui.body}>
        <div className={ui.split}>
          <div className={ui.stack}>
            <section className={ui.card} aria-labelledby="issue-hourly">
              <div className={ui.cardHeader}>
                <h2 id="issue-hourly" className={ui.cardTitle}>
                  Last 24 hours
                </h2>
                <span className={ui.meta}>
                  {issue.events_in_period.toLocaleString()}{" "}
                  {issue.events_in_period === 1 ? "event" : "events"} ·{" "}
                  {issue.users_in_period}{" "}
                  {issue.users_in_period === 1 ? "person" : "people"} · UTC
                </span>
              </div>
              {issue.events_in_period === 0 ? (
                <p className={ui.empty}>Not seen in the last 24 hours.</p>
              ) : (
                <BarChart
                  data={chart}
                  ariaLabel="This issue's events per hour, last 24 hours"
                  height={140}
                />
              )}
            </section>

            {event && (
              <section className={ui.card} aria-labelledby="occurrence-title">
                <div className={ui.cardHeader}>
                  <h2 id="occurrence-title" className={ui.cardTitle}>
                    Occurrence {event.reference}
                  </h2>
                  {event.sentry_url && (
                    <a
                      href={event.sentry_url}
                      className={styles.external}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Sentry{" "}
                      <ExternalLink
                        aria-hidden="true"
                        className={styles.icon}
                      />
                    </a>
                  )}
                </div>
                <dl className={ui.facts}>
                  <dt>When</dt>
                  <dd>
                    <FeedbackDate iso={event.created_at} withTime />
                  </dd>
                  {(event.method || event.path) && (
                    <>
                      <dt>Request</dt>
                      <dd>
                        <code>
                          {[event.method, event.path].filter(Boolean).join(" ")}
                        </code>
                        {event.status_code && ` → ${event.status_code}`}
                      </dd>
                    </>
                  )}
                  {event.route && (
                    <>
                      <dt>Route</dt>
                      <dd>
                        <code>{event.route}</code>
                      </dd>
                    </>
                  )}
                  <dt>Who</dt>
                  <dd>
                    {event.user_id ? (
                      <Link
                        href={`/admin/users/${event.user_id}`}
                        className={ui.link}
                      >
                        {event.user_name ?? "Deleted account"}
                      </Link>
                    ) : (
                      "Signed out"
                    )}
                    {event.user_email && (
                      <span className={ui.sub}>{event.user_email}</span>
                    )}
                  </dd>
                  {event.agency_id && (
                    <>
                      <dt>Agency</dt>
                      <dd>
                        <Link
                          href={`/admin/agencies/${event.agency_id}`}
                          className={ui.link}
                        >
                          View agency
                        </Link>
                      </dd>
                    </>
                  )}
                  {event.request_id && (
                    <>
                      <dt>Request id</dt>
                      <dd>
                        <code>{event.request_id}</code>
                      </dd>
                    </>
                  )}
                  <dt>Release</dt>
                  <dd>
                    {event.release ? <code>{event.release}</code> : "—"}
                    {event.environment && ` · ${event.environment}`}
                  </dd>
                  {event.context &&
                    Object.entries(event.context)
                      .filter(([, value]) => value !== null && value !== "")
                      .map(([key, value]) => (
                        <ContextFact key={key} name={key} value={value} />
                      ))}
                </dl>
                <h3 className={styles.subheading}>Message</h3>
                <pre className={styles.pre}>{event.message}</pre>
                {event.stacktrace && (
                  <>
                    <h3 className={styles.subheading}>Stack trace</h3>
                    <pre className={styles.pre} tabIndex={0}>
                      {event.stacktrace}
                    </pre>
                  </>
                )}
              </section>
            )}

            <section className={ui.card} aria-labelledby="recent-title">
              <div className={ui.cardHeader}>
                <h2 id="recent-title" className={ui.cardTitle}>
                  Recent occurrences
                </h2>
                <span className={ui.meta}>
                  {issue.event_count.toLocaleString()} all time
                </span>
              </div>
              {detail.recent_events.length === 0 ? (
                <p className={ui.empty}>
                  None kept. Occurrences are pruned after 30 days.
                </p>
              ) : (
                <div className={ui.tableScroll}>
                  <table className={ui.table}>
                    <thead>
                      <tr>
                        <th scope="col">Reference</th>
                        <th scope="col">When</th>
                        <th scope="col">Where</th>
                        <th scope="col">Who</th>
                        <th scope="col">Release</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recent_events.map((row) => (
                        <tr
                          key={row.id}
                          aria-current={
                            row.id === event?.id ? "true" : undefined
                          }
                          className={
                            row.id === event?.id ? styles.current : undefined
                          }
                        >
                          <td>
                            <Link
                              href={`/admin/errors/${issue.id}?event=${row.id}`}
                              className={`${ui.link} ${styles.mono}`}
                            >
                              {row.reference}
                            </Link>
                          </td>
                          <td>
                            <FeedbackDate iso={row.created_at} withTime />
                          </td>
                          <td>
                            <code>{row.route ?? row.path ?? "—"}</code>
                          </td>
                          <td>
                            {row.user_name ??
                              (row.user_id ? "Deleted account" : "Signed out")}
                          </td>
                          <td>
                            {row.release ? (
                              <code>{row.release.slice(0, 12)}</code>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <aside className={ui.stack}>
            <section className={ui.card} aria-labelledby="triage-title">
              <div className={ui.cardHeader}>
                <h2 id="triage-title" className={ui.cardTitle}>
                  Triage
                </h2>
              </div>
              <p className={ui.status}>
                <ErrorIssuePills issue={issue} />
              </p>
              <ErrorStatusActions issueId={issue.id} status={issue.status} />
              {detail.status_changed_by_name && (
                <p className={`${ui.muted} ${ui.spaced}`}>
                  Last changed by {detail.status_changed_by_name}
                  {detail.resolved_at && issue.status === "resolved" && (
                    <>
                      {" "}
                      on <FeedbackDate iso={detail.resolved_at} withTime />
                    </>
                  )}
                </p>
              )}
            </section>

            <section className={ui.card} aria-labelledby="facts-title">
              <div className={ui.cardHeader}>
                <h2 id="facts-title" className={ui.cardTitle}>
                  Details
                </h2>
              </div>
              <dl className={ui.facts}>
                {issue.culprit && (
                  <>
                    <dt>Where</dt>
                    <dd>
                      <code>{issue.culprit}</code>
                    </dd>
                  </>
                )}
                <dt>First seen</dt>
                <dd>
                  <FeedbackDate iso={issue.first_seen_at} withTime />
                </dd>
                <dt>Last seen</dt>
                <dd>
                  <FeedbackDate iso={issue.last_seen_at} withTime />
                </dd>
                {issue.regressed_at && (
                  <>
                    <dt>Regressed</dt>
                    <dd>
                      <FeedbackDate iso={issue.regressed_at} withTime />
                    </dd>
                  </>
                )}
                <dt>Events</dt>
                <dd>{issue.event_count.toLocaleString()} all time</dd>
                {issue.last_release && (
                  <>
                    <dt>Last release</dt>
                    <dd>
                      <code>{issue.last_release}</code>
                    </dd>
                  </>
                )}
              </dl>
              {issue.sentry_url && (
                <p className={ui.spaced}>
                  <a
                    href={issue.sentry_url}
                    className={styles.external}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Latest event in Sentry{" "}
                    <ExternalLink aria-hidden="true" className={styles.icon} />
                  </a>
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

/** "user_agent" → "User agent". */
function contextLabel(key: string): string {
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ContextFact = ({ name, value }: { name: string; value: unknown }) => (
  <>
    <dt>{contextLabel(name)}</dt>
    <dd>
      <code>{typeof value === "string" ? value : JSON.stringify(value)}</code>
    </dd>
  </>
);

export default ErrorIssuePage;

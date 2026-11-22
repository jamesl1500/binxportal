/**
 * ErrorDashboard.tsx
 *
 * The top of `/admin/errors`: how many errors in the last hour, 12 hours and
 * 24 hours (with how many distinct issues and people each covers), how many
 * issues are open, and errors per hour across the last day. Server-rendered
 * from `GET /admin/errors/summary`; the chart's hover is the only
 * interactive part.
 *
 * @module apps/binx-web/src/components/admin/ErrorDashboard/ErrorDashboard.tsx
 * @author Binx Portal
 */
import BarChart from "@/components/charts/BarChart/BarChart";
import {
  type ErrorSummary,
  hourLabel,
  trendLabel,
  WINDOW_LABELS,
} from "@/lib/admin-errors-client";

import styles from "./ErrorDashboard.module.scss";

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

const ErrorDashboard = ({ summary }: { summary: ErrorSummary }) => {
  const day = summary.windows["24h"];
  const chart = summary.hourly.map((hour) => ({
    label: hourLabel(hour.hour_start),
    value: hour.total,
  }));

  return (
    <div className={styles.dashboard}>
      <dl className={styles.tiles}>
        {WINDOW_LABELS.map(({ key, label }) => {
          const counts = summary.windows[key];
          return (
            <div
              key={key}
              className={styles.tile}
              data-hot={counts.events > 0 && key === "1h" ? "" : undefined}
            >
              <dt>{label}</dt>
              <dd>{counts.events.toLocaleString()}</dd>
              <span className={styles.hint}>
                {plural(counts.issues, "issue")} ·{" "}
                {plural(counts.users, "person", "people")}
              </span>
              {key === "24h" && (
                <span className={styles.hint}>
                  {trendLabel(counts.events, summary.previous_24h)}
                </span>
              )}
            </div>
          );
        })}
        <div className={styles.tile}>
          <dt>Open issues</dt>
          <dd>{summary.open_issues_24h.toLocaleString()}</dd>
          <span className={styles.hint}>
            Unresolved, seen in 24 hours · {summary.new_issues_24h} new
          </span>
        </div>
      </dl>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="errors-hourly-title">
          <header className={styles.cardHeader}>
            <h2 id="errors-hourly-title" className={styles.cardTitle}>
              Errors per hour
            </h2>
            <span className={styles.cardMeta}>Last 24 hours, UTC</span>
          </header>
          {day.events === 0 ? (
            <p className={styles.empty}>No errors in the last 24 hours.</p>
          ) : (
            <BarChart
              data={chart}
              ariaLabel="Errors per hour, last 24 hours"
              height={180}
            />
          )}
          <details className={styles.tableView}>
            <summary>Show as a table</summary>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Hour (UTC)</th>
                  <th scope="col">API</th>
                  <th scope="col">Web</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.hourly.map((hour) => (
                  <tr key={hour.hour_start}>
                    <td>{hourLabel(hour.hour_start)}</td>
                    <td>{hour.api}</td>
                    <td>{hour.web}</td>
                    <td>{hour.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section className={styles.card} aria-labelledby="errors-source-title">
          <header className={styles.cardHeader}>
            <h2 id="errors-source-title" className={styles.cardTitle}>
              Where they came from
            </h2>
            <span className={styles.cardMeta}>Last 24 hours</span>
          </header>
          <ul className={styles.sources}>
            {(["api", "web"] as const).map((source) => {
              const count = summary.by_source_24h[source];
              return (
                <li key={source} className={styles.source}>
                  <span className={styles.sourceName}>
                    {source === "api" ? "API" : "Web app"}
                  </span>
                  <span className={styles.sourceCount}>
                    {count.toLocaleString()}
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    {count > 0 && (
                      <span
                        className={styles.fill}
                        style={{
                          width: `${(count / Math.max(1, day.events)) * 100}%`,
                        }}
                      />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className={styles.note}>
            {summary.new_issues_24h === 0
              ? "No new kinds of error today."
              : `${plural(summary.new_issues_24h, "new kind")} of error first seen today.`}
          </p>
        </section>
      </div>
    </div>
  );
};

export default ErrorDashboard;

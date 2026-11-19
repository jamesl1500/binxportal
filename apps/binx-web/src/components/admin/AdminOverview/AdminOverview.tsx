/**
 * AdminOverview.tsx
 *
 * The Binx team's home: headline numbers across every agency, weekly
 * signups, the plan mix, the newest agencies, and the feedback still waiting
 * on us. Server-rendered from `GET /admin/overview` plus the open feedback
 * list; the only interactive piece is the signups chart's hover tooltip.
 *
 * @module apps/binx-web/src/components/admin/AdminOverview/AdminOverview.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import BarChart from "@/components/charts/BarChart/BarChart";
import FeedbackDate from "@/components/feedback/FeedbackDate/FeedbackDate";
import FeedbackStatusBadge from "@/components/feedback/FeedbackStatusBadge/FeedbackStatusBadge";
import { type PlatformOverview, weekLabel } from "@/lib/admin";
import {
  FEEDBACK_KIND_SHORT,
  type FeedbackAdminItem,
} from "@/lib/feedback-client";
import { formatMoneyCents } from "@/lib/money";

import styles from "./AdminOverview.module.scss";

interface AdminOverviewProps {
  overview: PlatformOverview;
  openFeedback: FeedbackAdminItem[];
  openFeedbackTotal: number;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function excerpt(text: string, limit = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}

const AdminOverview = ({
  overview,
  openFeedback,
  openFeedbackTotal,
}: AdminOverviewProps) => {
  const signups = overview.signups_by_week.map((week) => ({
    label: weekLabel(week.week_start),
    value: week.agencies,
  }));
  const signupsInRange = overview.signups_by_week.reduce(
    (sum, week) => sum + week.agencies,
    0,
  );
  const maxPlan = Math.max(1, ...overview.plan_mix.map((row) => row.agencies));

  return (
    <div className={styles.overview}>
      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt>Agencies</dt>
          <dd>{overview.agencies_total.toLocaleString()}</dd>
          <span className={styles.hint}>
            +{overview.agencies_new_7d} this week · +{overview.agencies_new_30d}{" "}
            in 30 days
          </span>
        </div>
        <div className={styles.tile}>
          <dt>People</dt>
          <dd>{overview.users_total.toLocaleString()}</dd>
          <span className={styles.hint}>
            {overview.staff_users.toLocaleString()} staff ·{" "}
            {plural(overview.portal_users, "portal client")}
          </span>
        </div>
        <div className={styles.tile}>
          <dt>Est. MRR</dt>
          <dd>{formatMoneyCents(overview.mrr_cents)}</dd>
          <span className={styles.hint}>
            {plural(
              overview.paying_agencies,
              "paying agency",
              "paying agencies",
            )}{" "}
            · {overview.trialing_agencies} on trial
          </span>
        </div>
        <div className={styles.tile}>
          <dt>Open feedback</dt>
          <dd>{openFeedbackTotal.toLocaleString()}</dd>
          <Link href="/admin/feedback" className={styles.tileLink}>
            Go to the inbox
          </Link>
        </div>
      </dl>

      <div className={styles.grid}>
        <section
          className={`${styles.card} ${styles.wide}`}
          aria-labelledby="signups-title"
        >
          <header className={styles.cardHeader}>
            <h2 id="signups-title" className={styles.cardTitle}>
              New agencies per week
            </h2>
            <span className={styles.cardMeta}>
              {plural(signupsInRange, "agency", "agencies")} in{" "}
              {overview.signups_by_week.length} weeks
            </span>
          </header>
          <BarChart
            data={signups}
            ariaLabel="New agencies per week"
            height={180}
          />
          <details className={styles.tableView}>
            <summary>Show as a table</summary>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Week of</th>
                  <th scope="col">New agencies</th>
                  <th scope="col">New people</th>
                </tr>
              </thead>
              <tbody>
                {overview.signups_by_week.map((week) => (
                  <tr key={week.week_start}>
                    <td>{weekLabel(week.week_start)}</td>
                    <td>{week.agencies}</td>
                    <td>{week.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section className={styles.card} aria-labelledby="plans-title">
          <header className={styles.cardHeader}>
            <h2 id="plans-title" className={styles.cardTitle}>
              Plan mix
            </h2>
            <span className={styles.cardMeta}>
              {overview.clients_total.toLocaleString()} clients ·{" "}
              {overview.projects_active.toLocaleString()} active projects
            </span>
          </header>
          <ul className={styles.plans}>
            {overview.plan_mix.map((row) => (
              <li key={row.key} className={styles.plan}>
                <span className={styles.planName}>{row.name}</span>
                <span className={styles.planCount}>
                  {row.agencies}
                  {row.trialing > 0 && (
                    <span className={styles.planTrial}>
                      {" "}
                      ({row.trialing} trial)
                    </span>
                  )}
                </span>
                <span className={styles.planTrack} aria-hidden="true">
                  {row.agencies > 0 && (
                    <span
                      className={styles.planFill}
                      style={{ width: `${(row.agencies / maxPlan) * 100}%` }}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className={`${styles.card} ${styles.wide}`}
          aria-labelledby="recent-title"
        >
          <header className={styles.cardHeader}>
            <h2 id="recent-title" className={styles.cardTitle}>
              Newest agencies
            </h2>
          </header>
          {overview.recent_agencies.length === 0 ? (
            <p className={styles.empty}>No agencies yet.</p>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Agency</th>
                    <th scope="col">Owner</th>
                    <th scope="col">Plan</th>
                    <th scope="col" className={styles.num}>
                      Team
                    </th>
                    <th scope="col" className={styles.num}>
                      Clients
                    </th>
                    <th scope="col">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recent_agencies.map((agency) => (
                    <tr key={agency.id}>
                      <td className={styles.strong}>
                        <Link
                          href={`/admin/agencies/${agency.id}`}
                          className={styles.rowLink}
                        >
                          {agency.name}
                        </Link>
                      </td>
                      <td>
                        {agency.owner_name ?? "—"}
                        {agency.owner_email && (
                          <span className={styles.sub}>
                            {agency.owner_email}
                          </span>
                        )}
                      </td>
                      <td>
                        {agency.plan_name}
                        {agency.trialing && (
                          <span className={styles.trialTag}>Trial</span>
                        )}
                      </td>
                      <td className={styles.num}>{agency.members}</td>
                      <td className={styles.num}>{agency.clients}</td>
                      <td>
                        {agency.created_at ? (
                          <FeedbackDate iso={agency.created_at} />
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

        <section className={styles.card} aria-labelledby="feedback-title">
          <header className={styles.cardHeader}>
            <h2 id="feedback-title" className={styles.cardTitle}>
              Waiting on us
            </h2>
            <Link href="/admin/feedback" className={styles.cardLink}>
              All feedback <ArrowRight aria-hidden="true" />
            </Link>
          </header>
          {openFeedback.length === 0 ? (
            <p className={styles.empty}>Inbox zero — nothing open.</p>
          ) : (
            <ul className={styles.feedback}>
              {openFeedback.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/admin/feedback/${item.id}`}
                    className={styles.feedbackRow}
                  >
                    <span className={styles.feedbackTop}>
                      <span className={styles.strong}>
                        {FEEDBACK_KIND_SHORT[item.kind]}
                      </span>
                      <FeedbackStatusBadge
                        status={item.status}
                        variant="admin"
                      />
                    </span>
                    <span className={styles.feedbackText}>
                      {item.message ? excerpt(item.message) : "Rating only"}
                    </span>
                    <span className={styles.sub}>
                      {item.user_name}
                      {item.agency_name ? ` · ${item.agency_name}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminOverview;

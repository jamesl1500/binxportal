/**
 * page.tsx - Dashboard Overview
 *
 * The at-a-glance roll-up: headline figures for the agency, the things that
 * need attention, a peek at the signed-in member's tasks, and a slice of
 * recent team activity. Deeper views live on the My work and Pulse tabs and
 * the top-nav pages.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/page.tsx
 * @author Binx.io
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getDashboard } from "@/lib/dashboard";
import { formatMoneyCents } from "@/lib/money";
import ClientStatGrid, { type ClientStat } from "@/components/clients/ClientStatGrid/ClientStatGrid";
import AiBriefingCard from "@/components/dashboard/AiBriefingCard/AiBriefingCard";
import AttentionCard from "@/components/dashboard/AttentionCard/AttentionCard";
import ActivityTeaser from "@/components/dashboard/ActivityTeaser/ActivityTeaser";
import MyTasksCard from "@/components/dashboard/MyTasksCard/MyTasksCard";

import styles from "./page.module.scss";

const DashboardOverviewPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  const agencyId = currentAgency.id;

  const overview = await getDashboard(agencyId);
  const {
    on_hold_projects: onHoldProjects,
    overdue_invoices: overdueInvoices,
    recent_activity: activity,
    my_work: myWork,
  } = overview;

  const currency = "USD";

  const stats: ClientStat[] = [
    {
      label: "Active projects",
      value: String(overview.projects_active),
      hint: `${overview.projects_total} total`,
    },
    {
      label: "Outstanding",
      value: formatMoneyCents(overview.invoice_summary.outstanding_cents, currency),
      hint: `${overview.invoice_summary.open_count} open`,
      tone: overview.invoice_summary.outstanding_cents > 0 ? "warn" : "positive",
    },
    {
      label: "Overdue",
      value: formatMoneyCents(overview.invoice_summary.overdue_cents, currency),
      hint: `${overview.invoice_summary.overdue_count} invoice${overview.invoice_summary.overdue_count === 1 ? "" : "s"}`,
      tone: overview.invoice_summary.overdue_cents > 0 ? "warn" : "positive",
    },
    { label: "Active clients", value: String(overview.clients_active), hint: `${overview.clients_total} total` },
    { label: "My open tasks", value: String(myWork.total_open), hint: `${myWork.overdue_count} overdue` },
    { label: "Unread messages", value: String(overview.unread_messages) },
  ];

  return (
    <div>
      <div className={styles.section}>
        <AiBriefingCard agencyId={agencyId} />
      </div>

      <ClientStatGrid stats={stats} />

      <div className={`${styles.grid} ${styles.afterStats}`}>
        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Needs attention</h2>
          </div>
          <AttentionCard
            overdueInvoices={overdueInvoices}
            overdueTaskCount={myWork.overdue_count}
            onHoldProjects={onHoldProjects}
          />
        </section>

        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Recent activity</h2>
            <Link href="/activity" className={styles.link}>
              View all
            </Link>
          </div>
          <ActivityTeaser entries={activity} />
        </section>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Your tasks</h2>
          <Link href="/dashboard/my-work" className={styles.link}>
            My work
          </Link>
        </div>
        <MyTasksCard tasks={myWork.tasks} limit={5} />
      </section>
    </div>
  );
};

export default DashboardOverviewPage;

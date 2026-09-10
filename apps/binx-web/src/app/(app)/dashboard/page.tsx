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
import { getAgencyClients } from "@/lib/clients";
import { getMyWork } from "@/lib/dashboard";
import { formatMoneyCents } from "@/lib/money";
import { getInvoices, getInvoiceSummary } from "@/lib/invoicing";
import { getUnreadMessageCount } from "@/lib/messaging";
import { getAgencyActivity } from "@/lib/activity";
import { getAgencyProjects } from "@/lib/projects";
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

  const [projects, summary, overdueInvoices, activity, clients, unreadMessages, myWork] = await Promise.all([
    getAgencyProjects(agencyId),
    getInvoiceSummary(agencyId),
    getInvoices(agencyId, { status: "overdue" }),
    getAgencyActivity(agencyId, { limit: 6 }),
    getAgencyClients(agencyId),
    getUnreadMessageCount(agencyId),
    getMyWork(agencyId).catch(() => ({ tasks: [], total_open: 0, overdue_count: 0, due_soon_count: 0 })),
  ]);

  const currency = "USD";
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const onHoldProjects = projects.filter((project) => project.status === "on_hold");
  const activeClients = clients.filter((client) => client.is_active).length;

  const stats: ClientStat[] = [
    { label: "Active projects", value: String(activeProjects), hint: `${projects.length} total` },
    {
      label: "Outstanding",
      value: formatMoneyCents(summary.outstanding_cents, currency),
      hint: `${summary.open_count} open`,
      tone: summary.outstanding_cents > 0 ? "warn" : "positive",
    },
    {
      label: "Overdue",
      value: formatMoneyCents(summary.overdue_cents, currency),
      hint: `${summary.overdue_count} invoice${summary.overdue_count === 1 ? "" : "s"}`,
      tone: summary.overdue_cents > 0 ? "warn" : "positive",
    },
    { label: "Active clients", value: String(activeClients), hint: `${clients.length} total` },
    { label: "My open tasks", value: String(myWork.total_open), hint: `${myWork.overdue_count} overdue` },
    { label: "Unread messages", value: String(unreadMessages) },
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
          <ActivityTeaser entries={activity.items} />
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

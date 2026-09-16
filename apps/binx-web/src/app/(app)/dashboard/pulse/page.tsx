/**
 * page.tsx - Dashboard · Pulse
 *
 * The charts view: collected-revenue trend, the project-status mix, and
 * billing activity by invoice status. Read-only — a health check, not a
 * working surface.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/pulse/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { formatMoneyCents, formatCompactMoney, invoiceStatusLabel } from "@/lib/money";
import { getInvoices, getInvoiceSummary } from "@/lib/invoicing";
import { getAgencyProjects } from "@/lib/projects";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/projects-client";
import ClientStatGrid, { type ClientStat } from "@/components/clients/ClientStatGrid/ClientStatGrid";
import LineChart from "@/components/charts/LineChart/LineChart";
import DonutChart from "@/components/charts/DonutChart/DonutChart";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Pulse" };

const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "#a1a1aa",
  active: "#0a0a0b",
  on_hold: "#d97706",
  completed: "#6e6e76",
  archived: "#d4d4d8",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  paid: "#0a0a0b",
  partial: "#6e6e76",
  sent: "#8b8b93",
  overdue: "#dc2626",
  draft: "#a1a1aa",
};

const PulsePage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [summary, invoices, projects] = await Promise.all([
    getInvoiceSummary(currentAgency.id),
    getInvoices(currentAgency.id),
    getAgencyProjects(currentAgency.id),
  ]);
  const currency = invoices[0]?.currency ?? "USD";

  const stats: ClientStat[] = [
    { label: "Paid this year", value: formatMoneyCents(summary.paid_this_year_cents, currency) },
    { label: "Lifetime billed", value: formatMoneyCents(summary.lifetime_billed_cents, currency) },
    { label: "Average invoice", value: formatMoneyCents(summary.average_invoice_cents, currency) },
    { label: "Drafts", value: String(summary.draft_count) },
  ];

  const statusCounts = new Map<ProjectStatus, number>();
  for (const project of projects) {
    statusCounts.set(project.status, (statusCounts.get(project.status) ?? 0) + 1);
  }
  const projectSegments = [...statusCounts.entries()].map(([status, count]) => ({
    label: PROJECT_STATUS_LABELS[status],
    value: count,
    color: PROJECT_STATUS_COLORS[status],
  }));

  const invoiceGroups = new Map<string, { count: number; amount: number }>();
  for (const invoice of invoices) {
    if (invoice.display_status === "void") continue;
    const group = invoiceGroups.get(invoice.display_status) ?? { count: 0, amount: 0 };
    group.count += 1;
    group.amount += invoice.total_cents;
    invoiceGroups.set(invoice.display_status, group);
  }
  const invoiceSegments = [...invoiceGroups.entries()].map(([status, group]) => ({
    label: invoiceStatusLabel(status),
    value: group.count,
    color: INVOICE_STATUS_COLORS[status] ?? "#a1a1aa",
    hint: formatCompactMoney(group.amount, currency),
  }));

  return (
    <div>
      <ClientStatGrid stats={stats} />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Collected revenue</h2>
        </div>
        {summary.monthly_paid.length > 0 ? (
          <LineChart
            data={summary.monthly_paid}
            ariaLabel="Collected revenue by month"
            valueFormat="currency"
          />
        ) : (
          <p className={styles.empty}>No payments recorded yet.</p>
        )}
      </section>

      <div className={`${styles.grid} ${styles.afterStats}`}>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Projects by status</h2>
          </div>
          {projectSegments.length > 0 ? (
            <DonutChart
              segments={projectSegments}
              ariaLabel="Projects grouped by status"
              centerPrimary={String(projects.length)}
              centerSecondary="Projects"
            />
          ) : (
            <p className={styles.empty}>No projects yet.</p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Billing activity</h2>
          </div>
          {invoiceSegments.length > 0 ? (
            <DonutChart
              segments={invoiceSegments}
              ariaLabel="Invoices grouped by status"
              centerPrimary={formatCompactMoney(summary.outstanding_cents, currency)}
              centerSecondary="Outstanding"
            />
          ) : (
            <p className={styles.empty}>No invoices yet.</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default PulsePage;

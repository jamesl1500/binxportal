/**
 * page.tsx - Client Dashboard
 *
 * The default client tab: headline figures, a collected-revenue trend,
 * invoice- and project-status breakdowns, and a peek at recent message
 * threads. All real now — project data and invoicing both come from binx-api.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/page.tsx
 * @author Binx.io
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClient } from "@/lib/clients";
import { getConversations } from "@/lib/messaging";
import { getInvoices, getInvoiceSummary, formatMoneyCents, formatCompactMoney, invoiceStatusLabel } from "@/lib/invoicing";
import { getAgencyProjects } from "@/lib/projects";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/projects-client";
import ClientStatGrid from "@/components/clients/ClientStatGrid/ClientStatGrid";
import LineChart from "@/components/charts/LineChart/LineChart";
import DonutChart from "@/components/charts/DonutChart/DonutChart";

import styles from "./page.module.scss";

interface ClientDashboardPageProps {
  params: Promise<{ clientId: string }>;
}

// Grayscale ramp + one signal colour (overdue), matching the app's restrained
// palette — the breakdown legend always carries the label, so identity is
// never colour-alone.
const INVOICE_STATUS_COLORS: Record<string, string> = {
  paid: "#0a0a0b",
  partial: "#6e6e76",
  sent: "#8b8b93",
  overdue: "#dc2626",
  draft: "#a1a1aa",
};

const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "#a1a1aa",
  active: "#0a0a0b",
  on_hold: "#d97706",
  completed: "#6e6e76",
  archived: "#d4d4d8",
};

const ClientDashboardPage = async ({ params }: ClientDashboardPageProps) => {
  const { clientId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [client, allProjects, clientConversations, invoices, summary] = await Promise.all([
    getAgencyClient(currentAgency.id, clientId),
    getAgencyProjects(currentAgency.id),
    getConversations(currentAgency.id, { clientId }),
    getInvoices(currentAgency.id, { clientId }),
    getInvoiceSummary(currentAgency.id, clientId),
  ]);

  const projects = allProjects.filter((project) => project.client_id === clientId);
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const recentConversations = clientConversations.slice(0, 4);
  const currency = invoices[0]?.currency ?? "USD";

  const projectStatusCounts = new Map<ProjectStatus, number>();
  for (const project of projects) {
    projectStatusCounts.set(project.status, (projectStatusCounts.get(project.status) ?? 0) + 1);
  }
  const projectSegments = [...projectStatusCounts.entries()].map(([status, count]) => ({
    label: PROJECT_STATUS_LABELS[status],
    value: count,
    color: PROJECT_STATUS_COLORS[status],
  }));

  // Invoices grouped by their displayed status (draft / sent / overdue / partial / paid),
  // void excluded — it's not "billing activity".
  const invoiceStatusGroups = new Map<string, { count: number; amount: number }>();
  for (const invoice of invoices) {
    if (invoice.display_status === "void") continue;
    const group = invoiceStatusGroups.get(invoice.display_status) ?? { count: 0, amount: 0 };
    group.count += 1;
    group.amount += invoice.total_cents;
    invoiceStatusGroups.set(invoice.display_status, group);
  }
  const invoiceSegments = [...invoiceStatusGroups.entries()].map(([status, group]) => ({
    label: invoiceStatusLabel(status),
    value: group.count,
    color: INVOICE_STATUS_COLORS[status] ?? "#a1a1aa",
    hint: formatCompactMoney(group.amount, currency),
  }));
  const billedInvoiceCount = [...invoiceStatusGroups.values()].reduce((total, g) => total + g.count, 0);

  return (
    <div className={styles.page}>
      <ClientStatGrid
        stats={[
          { label: "Active projects", value: String(activeProjects), hint: `${projects.length} total` },
          {
            label: "Outstanding",
            value: formatMoneyCents(summary.outstanding_cents, currency),
            hint:
              summary.overdue_cents > 0
                ? `${formatMoneyCents(summary.overdue_cents, currency)} overdue`
                : "Nothing overdue",
            tone: summary.overdue_cents > 0 ? "warn" : "default",
          },
          {
            label: "Collected this year",
            value: formatMoneyCents(summary.paid_this_year_cents, currency),
            tone: "positive",
          },
          { label: "Lifetime billed", value: formatMoneyCents(summary.lifetime_billed_cents, currency) },
        ]}
      />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Collected revenue</h2>
          <span className={styles.panelMeta}>Payments received, last 12 months</span>
        </div>
        <LineChart
          data={summary.monthly_paid}
          ariaLabel={`Monthly payments received for ${client.name} over the last 12 months`}
          valueFormat="currency"
          height={220}
        />
      </section>

      <div className={styles.donutRow}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Projects by status</h2>
          </div>
          {projectSegments.length > 0 ? (
            <DonutChart
              segments={projectSegments}
              ariaLabel={`${client.name} projects grouped by status`}
              centerPrimary={String(projects.length)}
              centerSecondary="Projects"
            />
          ) : (
            <p className={styles.empty}>No projects for this client yet.</p>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Invoices by status</h2>
            <Link href={`/clients/${client.id}/invoices`} className={styles.panelLink}>
              View all
            </Link>
          </div>
          {invoiceSegments.length > 0 ? (
            <DonutChart
              segments={invoiceSegments}
              ariaLabel={`${client.name} invoices grouped by status`}
              centerPrimary={String(billedInvoiceCount)}
              centerSecondary="Invoices"
            />
          ) : (
            <p className={styles.empty}>No invoices for this client yet.</p>
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Recent messages</h2>
          <Link href={`/messages?client=${client.id}`} className={styles.panelLink}>
            View all
          </Link>
        </div>
        {recentConversations.length === 0 ? (
          <p className={styles.empty}>No message threads linked to this client yet.</p>
        ) : (
          <ul className={styles.messageList}>
            {recentConversations.map((conversation) => (
              <li key={conversation.id} className={styles.messageRow} data-unread={conversation.unread_count > 0}>
                <div className={styles.messageMeta}>
                  <span className={styles.messageFrom}>{conversation.title}</span>
                  {conversation.last_message_at && (
                    <span className={styles.messageTime}>
                      {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
                <p className={styles.messagePreview}>{conversation.last_message_preview ?? "No messages yet"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ClientDashboardPage;

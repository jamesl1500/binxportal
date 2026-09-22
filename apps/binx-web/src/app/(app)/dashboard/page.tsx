/**
 * page.tsx - Dashboard Overview
 *
 * The at-a-glance roll-up: headline figures for the agency, and a
 * customizable widget grid (needs attention / recent activity / upcoming
 * meetings / my tasks / quick actions — see DashboardWidgetGrid) staff can
 * reorder and hide to fit how they work. Deeper views live on the My work
 * and Pulse tabs and the top-nav pages.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/page.tsx
 * @author Binx.io
 */
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getDashboard } from "@/lib/dashboard";
import { getMeetings } from "@/lib/meetings";
import { formatMoneyCents } from "@/lib/money";
import { getDashboardLayout } from "@/lib/users";
import ClientStatGrid, {
  type ClientStat,
} from "@/components/clients/ClientStatGrid/ClientStatGrid";
import AiBriefingCard from "@/components/dashboard/AiBriefingCard/AiBriefingCard";
import DashboardWidgetGrid from "@/components/dashboard/DashboardWidgetGrid/DashboardWidgetGrid";
import { DASHBOARD_WIDGET_IDS } from "@/components/dashboard/widgets";

const DashboardOverviewPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }
  const agencyId = currentAgency.id;

  const [overview, upcomingMeetings, layout] = await Promise.all([
    getDashboard(agencyId),
    getMeetings(agencyId, { status: "scheduled", fromDate: new Date().toISOString().slice(0, 10) }),
    getDashboardLayout().catch(() => ({ widget_order: [...DASHBOARD_WIDGET_IDS], hidden_widgets: [] })),
  ]);
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
      value: formatMoneyCents(
        overview.invoice_summary.outstanding_cents,
        currency,
      ),
      hint: `${overview.invoice_summary.open_count} open`,
      tone:
        overview.invoice_summary.outstanding_cents > 0 ? "warn" : "positive",
    },
    {
      label: "Overdue",
      value: formatMoneyCents(overview.invoice_summary.overdue_cents, currency),
      hint: `${overview.invoice_summary.overdue_count} invoice${overview.invoice_summary.overdue_count === 1 ? "" : "s"}`,
      tone: overview.invoice_summary.overdue_cents > 0 ? "warn" : "positive",
    },
    {
      label: "Active clients",
      value: String(overview.clients_active),
      hint: `${overview.clients_total} total`,
    },
    {
      label: "My open tasks",
      value: String(myWork.total_open),
      hint: `${myWork.overdue_count} overdue`,
    },
    { label: "Unread messages", value: String(overview.unread_messages) },
  ];

  return (
    <div>
      <div style={{ marginBottom: "25px" }}>
        <AiBriefingCard agencyId={agencyId} />
      </div>

      <ClientStatGrid stats={stats} />

      <div style={{ marginTop: "2rem" }}>
        <DashboardWidgetGrid
          initialOrder={layout.widget_order}
          initialHidden={layout.hidden_widgets}
          overdueInvoices={overdueInvoices}
          overdueTaskCount={myWork.overdue_count}
          onHoldProjects={onHoldProjects}
          activity={activity}
          meetings={upcomingMeetings}
          myTasks={myWork.tasks}
        />
      </div>
    </div>
  );
};

export default DashboardOverviewPage;

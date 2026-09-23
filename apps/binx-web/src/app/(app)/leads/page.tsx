/**
 * page.tsx - Leads
 *
 * The agency's lead pipeline: headline figures + a searchable, filterable
 * table + a "New lead" link to the dedicated `/leads/new` page. The (app)
 * layout above already guards for a signed-in session with a current
 * agency. Leads convert to real clients from the detail page.
 *
 * @module apps/binx-web/src/app/(app)/leads/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getLeads } from "@/lib/leads";
import { LEAD_STATUS_META } from "@/lib/leads-client";
import { formatCompactMoney } from "@/lib/money";
import ClientStatGrid, { type ClientStat } from "@/components/clients/ClientStatGrid/ClientStatGrid";
import AnalyzeAllButton from "@/components/leads/AnalyzeAllButton/AnalyzeAllButton";
import FindLeadsDialog from "@/components/leads/FindLeadsDialog/FindLeadsDialog";
import NewLeadButton from "@/components/leads/NewLeadButton/NewLeadButton";
import LeadsTable from "@/components/leads/LeadsTable/LeadsTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Leads" };

const LeadsPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const leads = await getLeads(currentAgency.id);

  const open = leads.filter((lead) => LEAD_STATUS_META[lead.status]?.open);
  const qualifiedPlus = leads.filter((lead) => ["qualified", "proposal"].includes(lead.status));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const wonThisMonth = leads.filter(
    (lead) => lead.status === "won" && lead.last_activity_at && new Date(lead.last_activity_at) >= monthStart,
  );
  const pipelineValue = open.reduce((total, lead) => total + (lead.estimated_value_cents ?? 0), 0);

  const stats: ClientStat[] = [
    { label: "Open leads", value: String(open.length), hint: `${leads.length} total` },
    { label: "Qualified+", value: String(qualifiedPlus.length) },
    { label: "Won this month", value: String(wonThisMonth.length), tone: wonThisMonth.length > 0 ? "positive" : "default" },
    { label: "Pipeline value", value: formatCompactMoney(pipelineValue, "USD") },
  ];

  return (
    <div>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Leads</span>
          <h1 className={styles.title}>Your pipeline</h1>
          <p className={styles.subtitle}>
            {open.length} open {open.length === 1 ? "lead" : "leads"} at {currentAgency.name}.
          </p>
        </div>
        <div className={styles.headerActions}>
          <AnalyzeAllButton agencyId={currentAgency.id} />
          <FindLeadsDialog agencyId={currentAgency.id} />
          <NewLeadButton />
        </div>
      </div>

      <div className={styles.stats}>
        <ClientStatGrid stats={stats} />
      </div>

      <LeadsTable agencyId={currentAgency.id} leads={leads} />
    </div>
  );
};

export default LeadsPage;

/**
 * page.tsx - New recurring invoice
 *
 * The retainer-schedule editor. Its first `next_run_date` is anchored from
 * the given start date (or today) by binx-api on creation.
 *
 * @module apps/binx-web/src/app/(app)/invoices/recurring/new/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClients } from "@/lib/clients";
import { getBillingSettings } from "@/lib/invoicing";
import { getAgencyProjects } from "@/lib/projects";
import RecurringScheduleForm from "@/components/invoices/RecurringScheduleForm/RecurringScheduleForm";

import styles from "../../page.module.scss";

export const metadata: Metadata = { title: "New recurring invoice" };

const NewRecurringInvoicePage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [clients, projects, settings] = await Promise.all([
    getAgencyClients(currentAgency.id),
    getAgencyProjects(currentAgency.id),
    getBillingSettings(currentAgency.id),
  ]);

  return (
    <div>
      <Link href="/invoices/recurring" className={styles.backLink}>
        ← Recurring invoices
      </Link>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Invoices</span>
          <h1 className={styles.title}>New recurring invoice</h1>
          <p className={styles.subtitle}>Bill a client on a schedule — weekly or monthly, automatically.</p>
        </div>
      </div>

      {clients.length === 0 ? (
        <p className={styles.notice}>Add a client from the Clients page before creating a schedule.</p>
      ) : (
        <div className={styles.formCard}>
          <RecurringScheduleForm
            agencyId={currentAgency.id}
            clients={clients.map((client) => ({ id: client.id, name: client.name }))}
            projects={projects.map((project) => ({
              id: project.id,
              name: project.name,
              client_id: project.client_id,
            }))}
            currency={settings.currency}
            defaultDueDays={settings.default_due_days}
            defaultTaxRatePercent={settings.default_tax_rate_percent}
          />
        </div>
      )}
    </div>
  );
};

export default NewRecurringInvoicePage;

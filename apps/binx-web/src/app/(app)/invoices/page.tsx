/**
 * page.tsx - Invoices
 *
 * The agency-wide invoice list: a summary stat row, a status/client-filterable
 * table, and a "New invoice" button. The (app) layout already guards for a
 * signed-in session with a current agency.
 *
 * @module apps/binx-web/src/app/(app)/invoices/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getInvoices, getInvoiceSummary, getBillingSettings, formatMoneyCents } from "@/lib/invoicing";
import ClientStatGrid from "@/components/clients/ClientStatGrid/ClientStatGrid";
import InvoiceTable from "@/components/invoices/InvoiceTable/InvoiceTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Invoices" };

const InvoicesPage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [invoices, summary, settings] = await Promise.all([
    getInvoices(currentAgency.id),
    getInvoiceSummary(currentAgency.id),
    getBillingSettings(currentAgency.id),
  ]);
  const currency = settings.currency;

  return (
    <div>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Invoices</span>
          <h1 className={styles.title}>Invoices</h1>
          <p className={styles.subtitle}>
            {summary.open_count} open{summary.overdue_count > 0 ? `, ${summary.overdue_count} overdue` : ""} ·{" "}
            {summary.draft_count} draft{summary.draft_count === 1 ? "" : "s"}
          </p>
        </div>

        <div className={styles.actions}>
          <Link href="/settings/invoicing" className={styles.settingsLink}>
            Invoicing settings
          </Link>
          <Link href="/invoices/new" className={styles.newButton}>
            <Plus aria-hidden="true" />
            New invoice
          </Link>
        </div>
      </div>

      <div className={styles.statRow}>
        <ClientStatGrid
          stats={[
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
            { label: "Average invoice", value: formatMoneyCents(summary.average_invoice_cents, currency) },
          ]}
        />
      </div>

      <div className={styles.tableWrapper}>
        <InvoiceTable invoices={invoices} showClient />
      </div>
    </div>
  );
};

export default InvoicesPage;

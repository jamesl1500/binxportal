/**
 * page.tsx - Client Invoices
 *
 * The client's invoice history and billing summary — the same table and
 * figures as the agency-wide `/invoices` page, scoped to this client. "New
 * invoice" pre-fills the client.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/invoices/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { getCurrentAgencyContext } from "@/lib/agencies";
import { getAgencyClient } from "@/lib/clients";
import { getInvoices, getInvoiceSummary, formatMoneyCents } from "@/lib/invoicing";
import ClientStatGrid from "@/components/clients/ClientStatGrid/ClientStatGrid";
import InvoiceTable from "@/components/invoices/InvoiceTable/InvoiceTable";

import styles from "./page.module.scss";

export const metadata: Metadata = { title: "Invoices" };

interface ClientInvoicesPageProps {
  params: Promise<{ clientId: string }>;
}

const ClientInvoicesPage = async ({ params }: ClientInvoicesPageProps) => {
  const { clientId } = await params;
  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [client, invoices, summary] = await Promise.all([
    getAgencyClient(currentAgency.id, clientId),
    getInvoices(currentAgency.id, { clientId }),
    getInvoiceSummary(currentAgency.id, clientId),
  ]);
  const currency = invoices[0]?.currency ?? "USD";

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Invoices</h2>
          <p className={styles.subtitle}>Billing history for {client.name}.</p>
        </div>
        <Link href={`/invoices/new?client=${client.id}`} className={styles.newButton}>
          <Plus aria-hidden="true" />
          New invoice
        </Link>
      </div>

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

      <InvoiceTable invoices={invoices} showClient={false} />
    </div>
  );
};

export default ClientInvoicesPage;

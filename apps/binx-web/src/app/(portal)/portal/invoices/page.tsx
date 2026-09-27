/**
 * page.tsx - Portal Invoices
 *
 * The client's invoices (drafts are never shown — binx-api filters them):
 * what's outstanding, what's overdue and what's been paid to date, then
 * the filterable list (see PortalInvoiceList).
 *
 * @module apps/binx-web/src/app/(portal)/portal/invoices/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Wallet } from "lucide-react";

import { formatMoneyCents } from "@/lib/money";
import { getPortalInvoices } from "@/lib/portal";
import { isUnpaid } from "@/lib/portal-insights";
import PortalInvoiceList from "@/components/portal/PortalInvoiceList/PortalInvoiceList";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";
import PortalStatTiles, { type PortalStat } from "@/components/portal/PortalStatTiles/PortalStatTiles";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Invoices" };

const PortalInvoicesPage = async () => {
  const invoices = await getPortalInvoices();
  const currency = invoices[0]?.currency ?? "USD";
  const unpaid = invoices.filter(isUnpaid);
  const overdue = unpaid.filter((invoice) => invoice.display_status === "overdue");
  const sum = (list: typeof invoices, pick: (invoice: (typeof invoices)[number]) => number) =>
    list.reduce((total, invoice) => total + pick(invoice), 0);

  const outstanding = sum(unpaid, (invoice) => invoice.amount_due_cents);
  const stats: PortalStat[] = [
    {
      label: "Outstanding",
      value: formatMoneyCents(outstanding, currency),
      hint: `${unpaid.length} unpaid`,
      icon: Wallet,
      tone: outstanding > 0 ? "warn" : "positive",
    },
    {
      label: "Overdue",
      value: formatMoneyCents(sum(overdue, (invoice) => invoice.amount_due_cents), currency),
      hint: overdue.length > 0 ? `${overdue.length} past due` : "Nothing late",
      icon: AlertTriangle,
      tone: overdue.length > 0 ? "warn" : "default",
    },
    {
      label: "Paid to date",
      value: formatMoneyCents(sum(invoices, (invoice) => invoice.amount_paid_cents), currency),
      hint: `Across ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`,
      icon: CheckCircle2,
      tone: "positive",
    },
  ];

  return (
    <div className={styles.page}>
      <PortalPageHeader
        eyebrow="Billing"
        title="Invoices"
        subtitle={
          unpaid.length > 0
            ? `${formatMoneyCents(outstanding, currency)} outstanding across ${unpaid.length} ${unpaid.length === 1 ? "invoice" : "invoices"}. Open one to pay securely by card.`
            : "You're all paid up — thank you!"
        }
      />

      {invoices.length === 0 ? (
        <p className={styles.empty}>No invoices yet.</p>
      ) : (
        <>
          <PortalStatTiles stats={stats} />
          <PortalInvoiceList invoices={invoices} />
        </>
      )}
    </div>
  );
};

export default PortalInvoicesPage;

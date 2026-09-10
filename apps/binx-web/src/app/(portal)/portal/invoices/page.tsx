/**
 * page.tsx - Portal Invoices
 *
 * The client's invoices (drafts are never shown — binx-api filters them).
 *
 * @module apps/binx-web/src/app/(portal)/portal/invoices/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";

import { formatMoneyCents, invoiceStatusLabel } from "@/lib/money";
import { getPortalInvoices } from "@/lib/portal";

import styles from "../page.module.scss";

export const metadata: Metadata = { title: "Invoices" };

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const PortalInvoicesPage = async () => {
  const invoices = await getPortalInvoices();
  const outstanding = invoices
    .filter((invoice) => invoice.display_status !== "paid" && invoice.display_status !== "void")
    .reduce((total, invoice) => total + invoice.amount_due_cents, 0);
  const currency = invoices[0]?.currency ?? "USD";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Invoices</span>
        <h1 className={styles.title}>Invoices</h1>
        <p className={styles.subtitle}>
          {formatMoneyCents(outstanding, currency)} outstanding across {invoices.length}{" "}
          {invoices.length === 1 ? "invoice" : "invoices"}.
        </p>
      </header>

      {invoices.length === 0 ? (
        <p className={styles.empty}>No invoices yet.</p>
      ) : (
        <ul className={styles.invoiceList}>
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link href={`/portal/invoices/${invoice.id}`} className={styles.invoiceRow}>
                <span>{invoice.number}</span>
                <span className={styles.invoiceStatus} data-status={invoice.display_status}>
                  {invoiceStatusLabel(invoice.display_status)}
                </span>
                <span className={styles.invoiceAmount}>
                  due {formatDate(invoice.due_date)} ·{" "}
                  {formatMoneyCents(invoice.amount_due_cents, invoice.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PortalInvoicesPage;

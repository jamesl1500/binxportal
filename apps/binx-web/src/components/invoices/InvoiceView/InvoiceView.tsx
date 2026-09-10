/**
 * InvoiceView.tsx
 *
 * The read / print layout for an invoice: the from / bill-to blocks, meta
 * (number, dates, status), the line-item table, totals, the payments ledger,
 * and notes. `@media print` in the stylesheet strips the app chrome so
 * "Print / Save as PDF" produces the invoice alone.
 *
 * @module apps/binx-web/src/components/invoices/InvoiceView/InvoiceView.tsx
 * @author Binx.io
 */
"use client";

import type { InvoiceDetail } from "@/lib/invoicing";
import { formatMoneyCents, invoiceStatusLabel, PAYMENT_METHOD_LABELS } from "@/lib/money";

import styles from "./InvoiceView.module.scss";

interface InvoiceViewProps {
  invoice: InvoiceDetail;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function quantityLabel(quantity: string): string {
  const n = Number.parseFloat(quantity);
  return Number.isInteger(n) ? String(n) : quantity;
}

const InvoiceView = ({ invoice }: InvoiceViewProps) => {
  const currency = invoice.currency;

  return (
    <article className={styles.invoice}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.number}>{invoice.number}</h1>
          <span className={styles.status} data-status={invoice.display_status}>
            {invoiceStatusLabel(invoice.display_status)}
          </span>
        </div>
        <dl className={styles.meta}>
          <div>
            <dt>Issued</dt>
            <dd>{formatDate(invoice.issue_date)}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{formatDate(invoice.due_date)}</dd>
          </div>
          {invoice.project_name && (
            <div>
              <dt>Project</dt>
              <dd>{invoice.project_name}</dd>
            </div>
          )}
        </dl>
      </header>

      <div className={styles.parties}>
        <section>
          <h2 className={styles.partyLabel}>From</h2>
          <p className={styles.partyName}>{invoice.from.name ?? "—"}</p>
          {invoice.from.address && <p className={styles.partyLine}>{invoice.from.address}</p>}
          {invoice.from.email && <p className={styles.partyLine}>{invoice.from.email}</p>}
          {invoice.from.tax_id && <p className={styles.partyLine}>Tax ID: {invoice.from.tax_id}</p>}
        </section>
        <section>
          <h2 className={styles.partyLabel}>Bill to</h2>
          <p className={styles.partyName}>{invoice.bill_to.name}</p>
          {invoice.bill_to.address && <p className={styles.partyLine}>{invoice.bill_to.address}</p>}
          {invoice.bill_to.email && <p className={styles.partyLine}>{invoice.bill_to.email}</p>}
        </section>
      </div>

      <table className={styles.lineTable}>
        <thead>
          <tr>
            <th>Description</th>
            <th className={styles.numCol}>Qty</th>
            <th className={styles.numCol}>Unit price</th>
            <th className={styles.numCol}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.line_items.map((item) => (
            <tr key={item.id}>
              <td>{item.description}</td>
              <td className={styles.numCol}>{quantityLabel(item.quantity)}</td>
              <td className={styles.numCol}>{formatMoneyCents(item.unit_price_cents, currency)}</td>
              <td className={styles.numCol}>{formatMoneyCents(item.amount_cents, currency)}</td>
            </tr>
          ))}
          {invoice.line_items.length === 0 && (
            <tr>
              <td colSpan={4} className={styles.noLines}>
                No line items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <dl className={styles.totals}>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoneyCents(invoice.subtotal_cents, currency)}</dd>
        </div>
        {invoice.discount_cents > 0 && (
          <div>
            <dt>
              Discount
              {invoice.discount_percent != null && ` (${Number.parseFloat(invoice.discount_percent)}%)`}
            </dt>
            <dd>−{formatMoneyCents(invoice.discount_cents, currency)}</dd>
          </div>
        )}
        {invoice.tax_cents > 0 && (
          <div>
            <dt>Tax ({Number.parseFloat(invoice.tax_rate_percent)}%)</dt>
            <dd>{formatMoneyCents(invoice.tax_cents, currency)}</dd>
          </div>
        )}
        <div className={styles.grandTotal}>
          <dt>Total</dt>
          <dd>{formatMoneyCents(invoice.total_cents, currency)}</dd>
        </div>
        {invoice.amount_paid_cents > 0 && (
          <>
            <div>
              <dt>Paid</dt>
              <dd>−{formatMoneyCents(invoice.amount_paid_cents, currency)}</dd>
            </div>
            <div className={styles.balance}>
              <dt>Balance due</dt>
              <dd>{formatMoneyCents(invoice.amount_due_cents, currency)}</dd>
            </div>
          </>
        )}
      </dl>

      {invoice.payments.length > 0 && (
        <section className={styles.payments}>
          <h2 className={styles.sectionLabel}>Payments</h2>
          <ul>
            {invoice.payments.map((payment) => (
              <li key={payment.id}>
                <span>{formatDate(payment.paid_on)}</span>
                <span>{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</span>
                <span className={styles.paymentRef}>{payment.reference ?? ""}</span>
                <span className={styles.paymentAmount}>{formatMoneyCents(payment.amount_cents, currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {invoice.notes && (
        <section className={styles.notes}>
          <h2 className={styles.sectionLabel}>Notes</h2>
          <p>{invoice.notes}</p>
        </section>
      )}
      {invoice.payment_instructions && (
        <section className={styles.notes}>
          <h2 className={styles.sectionLabel}>Payment instructions</h2>
          <p>{invoice.payment_instructions}</p>
        </section>
      )}
    </article>
  );
};

export default InvoiceView;

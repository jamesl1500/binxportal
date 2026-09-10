/**
 * money.ts
 *
 * Client-safe money formatting and invoice-status helpers — no dependency on
 * `lib/auth.ts` / `next/headers`, so both Server and Client Components can
 * import from here. The authenticated invoice fetch helpers live in
 * `lib/invoicing.ts` (server-only).
 *
 * @module apps/binx-web/src/lib/money.ts
 * @author Binx.io
 */

/** A single point on a time series (a month's collected revenue, …). */
export interface TimePoint {
  label: string;
  value: number;
}

/** Whole-cents → a currency string, e.g. formatMoneyCents(342563, "USD") → "$3,425.63". */
export function formatMoneyCents(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    // An unknown currency code — fall back to a plain number with the code.
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** Compact form for headline figures, e.g. "$3.4K". */
export function formatCompactMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

/** Stored statuses plus the two states the backend derives at read time. */
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type InvoiceDisplayStatus = InvoiceStatus | "overdue" | "partial";

export const INVOICE_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
  overdue: "Overdue",
  partial: "Partially paid",
};

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status as InvoiceDisplayStatus] ?? status;
}

/**
 * deriveDisplayStatus
 *
 * The same refinement binx-api's `service._display_status` does — kept here so
 * the client can recompute "overdue" as the day rolls over without a refetch.
 * The API already sends `display_status`; this is the fallback / local check.
 */
export function deriveDisplayStatus(invoice: {
  status: InvoiceStatus;
  due_date: string;
  total_cents: number;
  amount_paid_cents: number;
}): InvoiceDisplayStatus {
  if (invoice.status === "void" || invoice.status === "paid" || invoice.status === "draft") {
    return invoice.status;
  }
  const due = invoice.total_cents - invoice.amount_paid_cents;
  const today = new Date().toISOString().slice(0, 10);
  if (due > 0 && invoice.due_date < today) return "overdue";
  if (invoice.amount_paid_cents > 0 && invoice.amount_paid_cents < invoice.total_cents) return "partial";
  return "sent";
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  check: "Check",
  card: "Card",
  cash: "Cash",
  other: "Other",
  portal: "Client portal",
};

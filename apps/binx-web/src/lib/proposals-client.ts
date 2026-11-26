/**
 * proposals-client.ts
 *
 * Client-safe slice of the proposals data layer: the status display labels
 * and the attachment limit. Kept out of `lib/proposals.ts` so Client Components (the table,
 * the proposal view) can import it without dragging in `next/headers` via
 * `lib/auth.ts` — same reasoning as `lib/leads-client.ts`.
 *
 * @module apps/binx-web/src/lib/proposals-client.ts
 * @author Binx Portal
 */

/** Keep in sync with binx-api's proposals/models.py PROPOSAL_STATUSES. */
export const PROPOSAL_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  // The client has signed; the agency's countersignature is still due.
  awaiting_countersign: "Awaiting countersignature",
  declined: "Declined",
  expired: "Expired",
};

export function proposalStatusLabel(status: string): string {
  return PROPOSAL_STATUS_LABELS[status] ?? status;
}

/** Keep in sync with binx-api's proposals/models.py MAX_PROPOSAL_ATTACHMENTS. */
export const MAX_PROPOSAL_ATTACHMENTS = 10;

// ---- Monthly lines --------------------------------------------------------

/** binx-api proposals/models.py BILLING_ONE_TIME / BILLING_MONTHLY. */
export type LineBilling = "one_time" | "monthly";

export const PER_MONTH = " / mo";

/** " / mo" after a monthly line's prices, nothing after a one-time line's. */
export function billingSuffix(billing?: string | null): string {
  return billing === "monthly" ? PER_MONTH : "";
}

export interface ProposalTotals {
  tax_rate_percent: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  monthly_subtotal_cents?: number;
  monthly_tax_cents?: number;
  monthly_total_cents?: number;
}

export interface TotalRow {
  label: string;
  cents: number;
  perMonth: boolean;
  /** The bold total line of its block. */
  grand: boolean;
}

/**
 * The totals block under a proposal's lines, mirroring binx-api's
 * certificate PDF: the one-time subtotal, tax and total (left out when every
 * line is monthly), then the monthly lines' per-month subtotal, tax and
 * total. Tax rows only appear when there's tax.
 */
export function proposalTotalRows(totals: ProposalTotals): TotalRow[] {
  const monthly = totals.monthly_total_cents ?? 0;
  const taxLabel = `Tax (${Number.parseFloat(totals.tax_rate_percent) || 0}%)`;
  const rows: TotalRow[] = [];
  if (totals.subtotal_cents > 0 || monthly === 0) {
    rows.push({
      label: "Subtotal",
      cents: totals.subtotal_cents,
      perMonth: false,
      grand: false,
    });
    if (totals.tax_cents > 0) {
      rows.push({
        label: taxLabel,
        cents: totals.tax_cents,
        perMonth: false,
        grand: false,
      });
    }
    rows.push({
      label: "Total",
      cents: totals.total_cents,
      perMonth: false,
      grand: true,
    });
  }
  if (monthly > 0) {
    rows.push({
      label: "Monthly",
      cents: totals.monthly_subtotal_cents ?? 0,
      perMonth: true,
      grand: false,
    });
    if ((totals.monthly_tax_cents ?? 0) > 0) {
      rows.push({
        label: taxLabel,
        cents: totals.monthly_tax_cents ?? 0,
        perMonth: true,
        grand: false,
      });
    }
    rows.push({
      label: "Monthly total",
      cents: monthly,
      perMonth: true,
      grand: true,
    });
  }
  return rows;
}

/**
 * A proposal's price in one line, for lists and cards: "$10,000.00",
 * "$10,000.00 + $2,500.00 / mo", or "$2,500.00 / mo" when it's all monthly.
 * `format` is the caller's money formatter (so this file stays dependency-free).
 */
export function proposalPriceLabel(
  proposal: { total_cents: number; monthly_total_cents?: number },
  format: (cents: number) => string,
): string {
  const monthly = proposal.monthly_total_cents ?? 0;
  if (monthly <= 0) return format(proposal.total_cents);
  if (proposal.total_cents <= 0) return `${format(monthly)}${PER_MONTH}`;
  return `${format(proposal.total_cents)} + ${format(monthly)}${PER_MONTH}`;
}

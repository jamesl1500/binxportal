/**
 * payment-fees.ts
 *
 * The fees on an invoice a client pays online through the portal, for the
 * invoice editor's take-home preview and the marketing copy. Binx keeps
 * PLATFORM_FEE_BPS of the payment; Stripe charges its own processing fee
 * to the agency's Stripe account, estimated here at its standard US card
 * rate. The client pays only the invoice amount.
 *
 * Mirrors binx-api's modules/invoicing/fees.py, which is what actually
 * charges the fee. Change both together. The invoice detail page uses the
 * API's numbers (`invoice.fees`), not these.
 *
 * @module apps/binx-web/src/lib/payment-fees.ts
 * @author Binx Portal
 */

/** 1.25% of every invoice payment made online. */
export const PLATFORM_FEE_BPS = 125;
/** Stripe's standard US card rate, 2.9% + 30¢, used only for estimates. */
export const STRIPE_ESTIMATE_BPS = 290;
export const STRIPE_ESTIMATE_FIXED_CENTS = 30;

/** A basis-point rate as a short percentage: 125 → "1.25%", 290 → "2.9%". */
export function formatBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

export const PLATFORM_FEE_LABEL = formatBps(PLATFORM_FEE_BPS);
export const STRIPE_ESTIMATE_LABEL = `${formatBps(STRIPE_ESTIMATE_BPS)} + ${STRIPE_ESTIMATE_FIXED_CENTS}¢`;

/** Half-up rounding to the cent, like the API's ROUND_HALF_UP. */
function bpsOf(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10_000);
}

export interface OnlinePaymentEstimate {
  grossCents: number;
  stripeFeeCents: number;
  platformFeeCents: number;
  netCents: number;
}

/** What an agency keeps if a client pays `amountCents` online by card. */
export function estimateOnlinePayment(amountCents: number): OnlinePaymentEstimate {
  if (amountCents <= 0) {
    return { grossCents: 0, stripeFeeCents: 0, platformFeeCents: 0, netCents: 0 };
  }
  const platformFeeCents = bpsOf(amountCents, PLATFORM_FEE_BPS);
  const stripeFeeCents = Math.min(
    amountCents,
    bpsOf(amountCents, STRIPE_ESTIMATE_BPS) + STRIPE_ESTIMATE_FIXED_CENTS,
  );
  return {
    grossCents: amountCents,
    stripeFeeCents,
    platformFeeCents,
    netCents: amountCents - stripeFeeCents - platformFeeCents,
  };
}

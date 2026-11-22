/**
 * PaymentFeesCard.tsx
 *
 * Staff only: what online payment costs on this invoice and what the agency
 * keeps. Shows the fees on what's already been paid online (as Stripe
 * actually charged them, where known) and an estimate for whatever is still
 * due. The numbers come from the API's `invoice.fees`, which the client
 * portal never receives, and the card is left out of the printed invoice.
 *
 * @module apps/binx-web/src/components/invoices/PaymentFeesCard/PaymentFeesCard.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import { Receipt } from "lucide-react";

import type { InvoiceDetail } from "@/lib/invoicing";
import { formatMoneyCents } from "@/lib/money";
import { formatBps } from "@/lib/payment-fees";

import styles from "./PaymentFeesCard.module.scss";

type InvoiceFees = NonNullable<InvoiceDetail["fees"]>;
type Breakdown = NonNullable<InvoiceFees["if_paid_online"]>;

interface PaymentFeesCardProps {
  invoice: InvoiceDetail;
}

const FeeBreakdown = ({
  title,
  breakdown,
  currency,
  platformFeeLabel,
  estimate,
}: {
  title: string;
  breakdown: Breakdown;
  currency: string;
  platformFeeLabel: string;
  /** The whole breakdown is a forecast, not a payment that happened. */
  estimate: boolean;
}) => {
  const approx = (estimated: boolean) => (estimated ? "≈ " : "");
  return (
    <div className={styles.breakdown}>
      <h3 className={styles.title}>{title}</h3>
      <dl className={styles.rows}>
        <div>
          <dt>{estimate ? "Client pays" : "Client paid"}</dt>
          <dd>{formatMoneyCents(breakdown.gross_cents, currency)}</dd>
        </div>
        <div>
          <dt>Stripe processing{breakdown.stripe_fee_estimated ? " (estimated)" : ""}</dt>
          <dd>
            −{approx(breakdown.stripe_fee_estimated)}
            {formatMoneyCents(breakdown.stripe_fee_cents, currency)}
          </dd>
        </div>
        <div>
          <dt>Binx fee ({platformFeeLabel})</dt>
          <dd>−{formatMoneyCents(breakdown.platform_fee_cents, currency)}</dd>
        </div>
        <div className={styles.net}>
          <dt>{estimate ? "You keep" : "You kept"}</dt>
          <dd>
            {approx(breakdown.stripe_fee_estimated)}
            {formatMoneyCents(breakdown.net_cents, currency)}
          </dd>
        </div>
      </dl>
    </div>
  );
};

const PaymentFeesCard = ({ invoice }: PaymentFeesCardProps) => {
  const fees = invoice.fees;
  if (!fees) return null;
  const pending = fees.if_paid_online ?? null;
  const collected = fees.collected_online ?? null;
  if (!pending && !collected) return null;

  const platformFeeLabel = formatBps(fees.platform_fee_bps);
  const stripeRate = `${formatBps(fees.stripe_estimate_bps)} + ${fees.stripe_estimate_fixed_cents}¢`;

  return (
    <section className={styles.card} aria-labelledby="payment-fees-heading">
      <h2 id="payment-fees-heading" className={styles.eyebrow}>
        <Receipt className={styles.eyebrowIcon} aria-hidden="true" />
        Fees &amp; take-home
      </h2>

      <div className={styles.columns}>
        {collected && (
          <FeeBreakdown
            title="Paid online"
            breakdown={collected}
            currency={invoice.currency}
            platformFeeLabel={platformFeeLabel}
            estimate={false}
          />
        )}
        {pending && (
          <FeeBreakdown
            title={collected ? "If the rest is paid online" : "If your client pays online"}
            breakdown={pending}
            currency={invoice.currency}
            platformFeeLabel={platformFeeLabel}
            estimate
          />
        )}
      </div>

      <p className={styles.hint}>
        Binx keeps {platformFeeLabel} of each online payment, and Stripe
        charges its processing fee to your Stripe account. Estimates use
        Stripe&apos;s standard US card rate ({stripeRate}); once a payment
        is made, this shows what Stripe actually charged. Payments you record
        by hand have no fees.
      </p>
      {pending && !fees.online_payments_enabled && (
        <p className={styles.hint}>
          Clients can&apos;t pay you online yet.{" "}
          <Link href="/settings/invoicing">Connect Stripe</Link> to let them
          pay from the portal.
        </p>
      )}
    </section>
  );
};

export default PaymentFeesCard;

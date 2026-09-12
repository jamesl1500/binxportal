/**
 * PayInvoiceButton.tsx
 *
 * The client-portal "Pay now" control. Shown only while an invoice still has
 * a balance. Redirects to a real Stripe Checkout Session on the agency's own
 * connected account — the payment is recorded once Stripe's webhook confirms
 * it, not by this component. When the agency hasn't finished Stripe Connect
 * onboarding yet (`stripeReady={false}`), the button is disabled with an
 * explanatory note instead of silently pretending to work.
 *
 * @module apps/binx-web/src/components/portal/PayInvoiceButton/PayInvoiceButton.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { payInvoiceAction } from "@/app/(portal)/portal/invoices/actions";
import { formatMoneyCents } from "@/lib/money";

import styles from "./PayInvoiceButton.module.scss";

interface PayInvoiceButtonProps {
  invoiceId: string;
  amountDueCents: number;
  currency: string;
  agencyName: string;
  stripeReady: boolean;
}

const PayInvoiceButton = ({ invoiceId, amountDueCents, currency, agencyName, stripeReady }: PayInvoiceButtonProps) => {
  const [isPending, startTransition] = useTransition();

  const handlePay = () => {
    startTransition(async () => {
      const result = await payInvoiceAction(invoiceId);
      if (result.error || !result.checkoutUrl) {
        toast.error(result.error ?? "Unable to start checkout");
        return;
      }
      window.location.assign(result.checkoutUrl);
    });
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={handlePay}
        disabled={isPending || !stripeReady}
        aria-disabled={!stripeReady}
      >
        {isPending ? "Redirecting…" : `Pay ${formatMoneyCents(amountDueCents, currency)} now`}
      </button>
      {!stripeReady && (
        <p className={styles.note}>Online payment isn&apos;t set up yet — contact {agencyName} to arrange payment.</p>
      )}
    </div>
  );
};

export default PayInvoiceButton;

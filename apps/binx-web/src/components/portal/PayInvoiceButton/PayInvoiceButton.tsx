/**
 * PayInvoiceButton.tsx
 *
 * The client-portal "Pay now" control. Shown only while an invoice still has
 * a balance. Redirects to a real Stripe Checkout Session on the agency's own
 * connected account; the invoice page's CheckoutResult shows the outcome on
 * the way back. If checkout can't even start, the reason is shown in the
 * same PaymentResultDialog rather than a passing toast. When the agency hasn't finished Stripe Connect
 * onboarding yet (`stripeReady={false}`), the button is disabled with an
 * explanatory note instead of silently pretending to work.
 *
 * @module apps/binx-web/src/components/portal/PayInvoiceButton/PayInvoiceButton.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";

import { payInvoiceAction } from "@/app/(portal)/portal/invoices/actions";
import { formatMoneyCents } from "@/lib/money";
import PaymentResultDialog from "@/components/portal/PaymentResultDialog/PaymentResultDialog";

import styles from "./PayInvoiceButton.module.scss";

interface PayInvoiceButtonProps {
  invoiceId: string;
  invoiceNumber: string;
  amountDueCents: number;
  currency: string;
  agencyName: string;
  stripeReady: boolean;
}

const PayInvoiceButton = ({
  invoiceId,
  invoiceNumber,
  amountDueCents,
  currency,
  agencyName,
  stripeReady,
}: PayInvoiceButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handlePay = () => {
    startTransition(async () => {
      const result = await payInvoiceAction(invoiceId);
      if (result.error || !result.checkoutUrl) {
        setError(
          result.error ?? "We couldn't open Stripe Checkout. Please try again.",
        );
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
        {isPending
          ? "Redirecting…"
          : `Pay ${formatMoneyCents(amountDueCents, currency)} now`}
      </button>
      <PaymentResultDialog
        state={error ? "error" : null}
        invoiceNumber={invoiceNumber}
        agencyName={agencyName}
        message={error ?? undefined}
        onClose={() => setError(null)}
        onRetry={() => {
          setError(null);
          handlePay();
        }}
      />
      {!stripeReady && (
        <p className={styles.note}>
          Online payment isn&apos;t set up yet — contact {agencyName} to arrange
          payment.
        </p>
      )}
    </div>
  );
};

export default PayInvoiceButton;

/**
 * PaymentResultDialog.tsx
 *
 * The client portal's payment outcome modal — what a client sees instead of
 * a passing toast after Stripe Checkout (CheckoutResult) or when checkout
 * can't even start (PayInvoiceButton). Purely presentational: the caller
 * owns the state and the actions.
 *
 * - `confirming`: spinner while binx-api checks the session with Stripe;
 *   not dismissible, so it can't be closed mid-check.
 * - `paid`: the payment is recorded on the invoice.
 * - `processing`: checkout finished but the method (e.g. a bank debit) is
 *   still settling; the invoice updates when Stripe confirms.
 * - `failed`: the session expired or the payment didn't go through.
 * - `canceled`: the client backed out of Checkout; nothing was charged.
 * - `error`: we couldn't reach Stripe / start checkout; `message` says why.
 *
 * `onRetry` adds a "Try again" button to the failed/error states.
 *
 * @module apps/binx-web/src/components/portal/PaymentResultDialog/PaymentResultDialog.tsx
 * @author Binx Portal
 */
"use client";

import { Dialog } from "@base-ui/react/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import styles from "./PaymentResultDialog.module.scss";

export type PaymentResultState =
  | "confirming"
  | "paid"
  | "processing"
  | "failed"
  | "canceled"
  | "error";

interface PaymentResultDialogProps {
  state: PaymentResultState | null;
  invoiceNumber: string;
  agencyName: string;
  /** Formatted amount, e.g. "$9,250.00" — the amount paid, or the balance. */
  amountLabel?: string;
  /** Specific error text for the `error` state. */
  message?: string;
  onClose: () => void;
  onRetry?: () => void;
}

interface Copy {
  icon: LucideIcon;
  tone: "busy" | "success" | "info" | "danger" | "neutral";
  title: string;
  body: string;
}

function copyFor({
  state,
  invoiceNumber,
  agencyName,
  amountLabel,
  message,
}: Omit<PaymentResultDialogProps, "onClose" | "onRetry"> & {
  state: PaymentResultState;
}): Copy {
  switch (state) {
    case "confirming":
      return {
        icon: Loader2,
        tone: "busy",
        title: "Confirming your payment…",
        body: "Checking with Stripe. This usually takes a second or two.",
      };
    case "paid":
      return {
        icon: CheckCircle2,
        tone: "success",
        title: "Payment successful",
        body: `${amountLabel ? `${amountLabel} paid` : "Your payment went through"} for invoice ${invoiceNumber}. Thank you! ${agencyName} has been notified, and the invoice is now marked as paid.`,
      };
    case "processing":
      return {
        icon: Clock,
        tone: "info",
        title: "Payment processing",
        body: `Your payment for invoice ${invoiceNumber} was submitted and is still clearing with your bank. The invoice will update automatically once Stripe confirms it. There's no need to pay again.`,
      };
    case "failed":
      return {
        icon: XCircle,
        tone: "danger",
        title: "Payment didn't go through",
        body: `We couldn't complete the payment for invoice ${invoiceNumber}, and you haven't been charged. You can try again, or use a different card.`,
      };
    case "canceled":
      return {
        icon: XCircle,
        tone: "neutral",
        title: "Payment canceled",
        body: `You left checkout before paying invoice ${invoiceNumber}. No charge was made. You can pay whenever you're ready.`,
      };
    case "error":
      return {
        icon: AlertTriangle,
        tone: "danger",
        title: "Something went wrong",
        body:
          message ??
          `We couldn't reach Stripe. Please try again, or contact ${agencyName} if it keeps happening.`,
      };
  }
}

const PaymentResultDialog = ({
  state,
  onClose,
  onRetry,
  ...rest
}: PaymentResultDialogProps) => {
  const copy = state ? copyFor({ state, ...rest }) : null;
  const busy = state === "confirming";
  const canRetry =
    Boolean(onRetry) && (state === "failed" || state === "error");

  return (
    <Dialog.Root
      open={state !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup
          className={styles.dialog}
          data-tone={copy?.tone}
          aria-busy={busy}
        >
          {copy && (
            <>
              <span className={styles.iconWrap} aria-hidden="true">
                <copy.icon className={styles.icon} data-spin={busy} />
              </span>
              <Dialog.Title className={styles.title}>{copy.title}</Dialog.Title>
              <Dialog.Description className={styles.body}>
                {copy.body}
              </Dialog.Description>
              {!busy && (
                <div className={styles.actions}>
                  {canRetry && (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={onRetry}
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={onClose}
                  >
                    {state === "paid" ? "View invoice" : "Close"}
                  </button>
                </div>
              )}
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PaymentResultDialog;

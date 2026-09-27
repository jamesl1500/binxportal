/**
 * CheckoutResult.tsx
 *
 * Runs on the invoice page when the client lands back from Stripe Checkout
 * (`?checkout=success&session_id=…` or `?checkout=cancel`) and shows the
 * outcome in PaymentResultDialog.
 *
 * On success it asks binx-api to check the session with Stripe directly
 * (confirmPaymentAction), which records the payment right away if it has
 * settled — so the answer never depends on webhook timing or routing. It
 * used to toast "confirming with Stripe…" and refresh twice, which left a
 * client staring at an unpaid invoice whenever the webhook was slow or
 * never arrived.
 *
 * The query string is stripped (history.replaceState) once read, so a
 * reload doesn't replay the dialog; the check itself is idempotent anyway.
 *
 * @module apps/binx-web/src/components/portal/CheckoutResult/CheckoutResult.tsx
 * @author Binx.io
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { confirmPaymentAction } from "@/app/(portal)/portal/invoices/actions";
import { formatMoneyCents } from "@/lib/money";
import PaymentResultDialog, { type PaymentResultState } from "@/components/portal/PaymentResultDialog/PaymentResultDialog";

interface CheckoutResultProps {
  status: "success" | "cancel" | undefined;
  sessionId: string | undefined;
  invoiceId: string;
  invoiceNumber: string;
  agencyName: string;
}

const CheckoutResult = ({ status, sessionId, invoiceId, invoiceNumber, agencyName }: CheckoutResultProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<PaymentResultState | null>(null);
  const [amountLabel, setAmountLabel] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const handled = useRef(false);

  const confirm = useCallback(
    async (id: string) => {
      setState("confirming");
      const result = await confirmPaymentAction(invoiceId, id);
      if (result.error || !result.outcome) {
        setMessage(result.error);
        setState("error");
        return;
      }
      if (result.amountPaidCents !== undefined && result.currency) {
        setAmountLabel(formatMoneyCents(result.amountPaidCents, result.currency));
      }
      // "open" = Checkout was never finished, i.e. nothing was charged.
      setState(result.outcome === "open" ? "canceled" : result.outcome);
      if (result.outcome === "paid") router.refresh();
    },
    [invoiceId, router],
  );

  useEffect(() => {
    if (!status || handled.current) return;
    handled.current = true;
    // Drop ?checkout=…&session_id=… so a reload doesn't replay this.
    window.history.replaceState(null, "", pathname);

    if (status === "cancel") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the one-time return from Stripe
      setState("canceled");
    } else if (sessionId) {
      void confirm(sessionId);
    } else {
      // An older success link without a session id: all we know is that
      // Stripe sent them back; the webhook records the payment.
      setState("processing");
    }
  }, [status, sessionId, pathname, confirm]);

  return (
    <PaymentResultDialog
      state={state}
      invoiceNumber={invoiceNumber}
      agencyName={agencyName}
      amountLabel={amountLabel}
      message={message}
      onClose={() => setState(null)}
      onRetry={state === "error" && sessionId ? () => void confirm(sessionId) : undefined}
    />
  );
};

export default CheckoutResult;

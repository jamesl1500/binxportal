/**
 * PayInvoiceButton.tsx
 *
 * The client-portal "Pay now" control. Shown only while an invoice still has
 * a balance. Calls `payInvoiceAction` (a stub today), toasts, and refreshes
 * the page so the paid state + payment ledger update. A "demo payment"
 * notice makes clear no real charge happens yet.
 *
 * @module apps/binx-web/src/components/portal/PayInvoiceButton/PayInvoiceButton.tsx
 * @author Binx.io
 */
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { payInvoiceAction } from "@/app/(portal)/portal/invoices/actions";
import { formatMoneyCents } from "@/lib/money";

import styles from "./PayInvoiceButton.module.scss";

interface PayInvoiceButtonProps {
  invoiceId: string;
  amountDueCents: number;
  currency: string;
}

const PayInvoiceButton = ({ invoiceId, amountDueCents, currency }: PayInvoiceButtonProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handlePay = () => {
    startTransition(async () => {
      const result = await payInvoiceAction(invoiceId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Payment recorded — thank you!");
      router.refresh();
    });
  };

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={handlePay} disabled={isPending}>
        {isPending ? "Processing…" : `Pay ${formatMoneyCents(amountDueCents, currency)} now`}
      </button>
      <p className={styles.note}>Demo payment — this marks the invoice paid without a real charge.</p>
    </div>
  );
};

export default PayInvoiceButton;

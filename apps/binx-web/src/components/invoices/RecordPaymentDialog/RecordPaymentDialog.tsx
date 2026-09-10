/**
 * RecordPaymentDialog.tsx
 *
 * Records a payment received against an invoice — amount (prefilled to the
 * outstanding balance), date, method, and an optional reference. binx-api
 * flips the invoice to "paid" once payments cover the total.
 *
 * @module apps/binx-web/src/components/invoices/RecordPaymentDialog/RecordPaymentDialog.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";

import type { InvoiceDetail } from "@/lib/invoicing";
import { formatMoneyCents, PAYMENT_METHOD_LABELS } from "@/lib/money";
import { addInvoicePaymentAction } from "@/app/(app)/invoices/actions";

import styles from "./RecordPaymentDialog.module.scss";

interface RecordPaymentDialogProps {
  agencyId: string;
  invoice: InvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RecordPaymentDialog = ({ agencyId, invoice, open, onOpenChange }: RecordPaymentDialogProps) => {
  const router = useRouter();
  const balance = Math.max(0, invoice.amount_due_cents);

  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountCents = Math.round(Number.parseFloat(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0 || submitting) return;

    setSubmitting(true);
    try {
      const result = await addInvoicePaymentAction(agencyId, invoice.id, {
        amountCents,
        paidOn,
        method,
        reference: reference.trim() || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onOpenChange(false);
      setReference("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog} aria-label="Record a payment">
          <Dialog.Title className={styles.title}>Record a payment</Dialog.Title>
          <Dialog.Description className={styles.description}>
            {invoice.number} · balance {formatMoneyCents(balance, invoice.currency)}
          </Dialog.Description>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>Amount</span>
              <input
                className={styles.input}
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Date received</span>
              <input
                className={styles.input}
                type="date"
                value={paidOn}
                onChange={(event) => setPaidOn(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Method</span>
              <select
                className={styles.input}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Reference (optional)</span>
              <input
                className={styles.input}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Check no., wire ref…"
              />
            </label>

            <div className={styles.actions}>
              <button type="button" className={styles.cancel} onClick={() => onOpenChange(false)}>
                Cancel
              </button>
              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? "Recording…" : "Record payment"}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default RecordPaymentDialog;

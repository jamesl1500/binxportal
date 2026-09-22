/**
 * InvoiceActions.tsx
 *
 * The status-aware control bar above an invoice. Draft: Edit / Issue
 * (owner-admin) / Delete (owner-admin). Sent or paid: Record payment / Void
 * (owner-admin). Void: nothing. "Print / Save as PDF" is always available.
 * Issue and Void go through a confirm dialog. The issue dialog's "Email the
 * client a notice" checkbox reveals an editable recipient-email input,
 * pre-filled from the client's billing/contact email (`invoice.bill_to.email`)
 * but overridable per-send.
 *
 * @module apps/binx-web/src/components/invoices/InvoiceActions/InvoiceActions.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import type { InvoiceDetail } from "@/lib/invoicing";
import {
  deleteInvoiceAction,
  issueInvoiceAction,
  voidInvoiceAction,
} from "@/app/(app)/invoices/actions";
import RecordPaymentDialog from "@/components/invoices/RecordPaymentDialog/RecordPaymentDialog";

import styles from "./InvoiceActions.module.scss";

interface InvoiceActionsProps {
  agencyId: string;
  invoice: InvoiceDetail;
  /** True for owners/admins — gates issue, void, and delete. */
  canManage: boolean;
  /** The client's billing/contact email, so the "email the client" option can be disabled when absent. */
  clientHasEmail: boolean;
}

const InvoiceActions = ({ agencyId, invoice, canManage, clientHasEmail }: InvoiceActionsProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [sendNotice, setSendNotice] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(invoice.bill_to.email ?? "");

  const isDraft = invoice.status === "draft";
  const isVoid = invoice.status === "void";
  const isOpenForPayment = invoice.status === "sent" || invoice.status === "paid";

  const run = (action: () => Promise<{ error?: string }>) => {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <button type="button" className={styles.ghost} onClick={() => window.print()}>
          <Printer aria-hidden="true" /> Print / Save as PDF
        </button>
      </div>

      <div className={styles.right}>
        {isDraft && (
          <Link href={`/invoices/${invoice.id}/edit`} className={styles.ghost}>
            Edit
          </Link>
        )}
        {isDraft && canManage && (
          <button
            type="button"
            className={styles.ghostDanger}
            disabled={isPending}
            onClick={() => run(() => deleteInvoiceAction(agencyId, invoice.id))}
          >
            Delete
          </button>
        )}
        {isDraft && canManage && (
          <button type="button" className={styles.primary} onClick={() => setIssueOpen(true)}>
            Issue invoice
          </button>
        )}

        {isOpenForPayment && (
          <button type="button" className={styles.primary} onClick={() => setPaymentOpen(true)}>
            Record payment
          </button>
        )}
        {isOpenForPayment && canManage && (
          <button type="button" className={styles.ghostDanger} onClick={() => setVoidOpen(true)}>
            Void
          </button>
        )}

        {isDraft && !canManage && <span className={styles.hint}>An owner or admin issues invoices.</span>}
        {isVoid && <span className={styles.hint}>This invoice was voided.</span>}
      </div>

      <RecordPaymentDialog
        agencyId={agencyId}
        invoice={invoice}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />

      <Dialog.Root open={issueOpen} onOpenChange={setIssueOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Issue this invoice">
            <Dialog.Title className={styles.dialogTitle}>Issue {invoice.number}?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Once issued, the invoice can&apos;t be edited — only payments recorded, or the whole thing voided.
            </Dialog.Description>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={sendNotice}
                onChange={(event) => setSendNotice(event.target.checked)}
              />
              Email the client a notice
              {!clientHasEmail && !recipientEmail && (
                <span className={styles.hint}> — no billing email on file</span>
              )}
            </label>
            {sendNotice && (
              <label className={styles.field}>
                <span className={styles.label}>Recipient email</span>
                <input
                  type="email"
                  className={styles.input}
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="jamie@example.com"
                  required
                />
              </label>
            )}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setIssueOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={isPending || (sendNotice && recipientEmail.trim() === "")}
                onClick={() =>
                  run(async () => {
                    const result = await issueInvoiceAction(
                      agencyId,
                      invoice.id,
                      sendNotice,
                      sendNotice ? recipientEmail.trim() : null,
                    );
                    if (!result.error) setIssueOpen(false);
                    return result;
                  })
                }
              >
                Issue invoice
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={voidOpen} onOpenChange={setVoidOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Void this invoice">
            <Dialog.Title className={styles.dialogTitle}>Void {invoice.number}?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              The invoice keeps its number for your records but becomes read-only. This can&apos;t be undone.
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setVoidOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerSolid}
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const result = await voidInvoiceAction(agencyId, invoice.id);
                    if (!result.error) setVoidOpen(false);
                    return result;
                  })
                }
              >
                Void invoice
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default InvoiceActions;

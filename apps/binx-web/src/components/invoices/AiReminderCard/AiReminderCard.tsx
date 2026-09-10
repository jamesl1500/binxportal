/**
 * AiReminderCard.tsx
 *
 * "Draft reminder" button for a sent (including overdue/partially-paid)
 * invoice — drafts a friendly-but-firm payment reminder via
 * `generateInvoiceReminderAction`. The draft lands in an editable textarea
 * with copy-to-clipboard and, when the client has an email on file, a
 * prefilled `mailto:` link. Renders nothing for a draft/paid/void invoice —
 * the backend rejects those with a 400, so there's nothing useful to offer.
 *
 * @module apps/binx-web/src/components/invoices/AiReminderCard/AiReminderCard.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { generateInvoiceReminderAction } from "@/app/(app)/invoices/actions";
import type { InvoiceDetail } from "@/lib/invoicing";

import styles from "./AiReminderCard.module.scss";

interface AiReminderCardProps {
  agencyId: string;
  invoice: InvoiceDetail;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const AiReminderCard = ({ agencyId, invoice }: AiReminderCardProps) => {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (invoice.status !== "sent") {
    return null;
  }

  const handleGenerate = () => {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await generateInvoiceReminderAction(agencyId, invoice.id);
      if (result.draft) {
        setDraft(result.draft);
      } else {
        setError(result.error ?? "Unable to draft a reminder");
      }
    });
  };

  const handleCopy = async () => {
    if (!draft) return;
    setCopied(await copyToClipboard(draft));
  };

  const clientEmail = invoice.bill_to.email;
  const mailtoHref = draft
    ? `mailto:${clientEmail ?? ""}?subject=${encodeURIComponent(`Invoice ${invoice.number}`)}&body=${encodeURIComponent(draft)}`
    : undefined;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>
          <Sparkles className={styles.eyebrowIcon} aria-hidden="true" />
          AI payment reminder
        </span>
        <button type="button" className={styles.generate} onClick={handleGenerate} disabled={isPending}>
          {isPending ? "Drafting…" : draft ? "Regenerate" : "Draft reminder"}
        </button>
      </div>

      {!draft && !error && !isPending && (
        <p className={styles.hint}>
          {invoice.display_status === "overdue"
            ? "This invoice is overdue — draft a friendly-but-firm reminder in one click."
            : "Draft a payment reminder for this invoice in one click."}
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}

      {draft && (
        <>
          <textarea
            className={styles.textarea}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.copy} onClick={handleCopy}>
              {copied ? "Copied!" : "Copy to clipboard"}
            </button>
            {clientEmail && (
              <a className={styles.mailto} href={mailtoHref}>
                Open in email
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AiReminderCard;

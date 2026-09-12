/**
 * AiFollowUpCard.tsx
 *
 * "Draft follow-up" button for a lead still in the pipeline — drafts a
 * warm, no-pressure check-in email via `generateLeadFollowupAction`. Same
 * shape as invoices/AiReminderCard: the draft lands in an editable textarea
 * with copy-to-clipboard and, when the lead has an email on file, a
 * prefilled `mailto:` link. Renders nothing for a won/lost lead — the
 * backend rejects those with a 400, so there's nothing useful to offer.
 *
 * @module apps/binx-web/src/components/leads/AiFollowUpCard/AiFollowUpCard.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { generateLeadFollowupAction } from "@/app/(app)/leads/actions";

import styles from "./AiFollowUpCard.module.scss";

interface AiFollowUpCardProps {
  agencyId: string;
  leadId: string;
  status: string;
  contactEmail: string | null;
  leadName: string;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const AiFollowUpCard = ({ agencyId, leadId, status, contactEmail, leadName }: AiFollowUpCardProps) => {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (status === "won" || status === "lost") {
    return null;
  }

  const handleGenerate = () => {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await generateLeadFollowupAction(agencyId, leadId);
      if (result.draft) {
        setDraft(result.draft);
      } else {
        setError(result.error ?? "Unable to draft a follow-up");
      }
    });
  };

  const handleCopy = async () => {
    if (!draft) return;
    setCopied(await copyToClipboard(draft));
  };

  const mailtoHref = draft
    ? `mailto:${contactEmail ?? ""}?subject=${encodeURIComponent(`Following up — ${leadName}`)}&body=${encodeURIComponent(draft)}`
    : undefined;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>
          <Sparkles className={styles.eyebrowIcon} aria-hidden="true" />
          AI follow-up
        </span>
        <button type="button" className={styles.generate} onClick={handleGenerate} disabled={isPending}>
          {isPending ? "Drafting…" : draft ? "Regenerate" : "Draft follow-up"}
        </button>
      </div>

      {!draft && !error && !isPending && (
        <p className={styles.hint}>Draft a warm, no-pressure check-in email for this lead in one click.</p>
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
            {contactEmail && (
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

export default AiFollowUpCard;

/**
 * AiProjectSummaryCard.tsx
 *
 * "Generate update" button that drafts a client-ready status update from the
 * project's board via `generateProjectSummaryAction`. The draft lands in an
 * editable textarea (nothing is sent anywhere — this only writes text) with
 * a copy-to-clipboard button, so a PM can tweak it before pasting it into an
 * email or message.
 *
 * @module apps/binx-web/src/components/projects/AiProjectSummaryCard/AiProjectSummaryCard.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { generateProjectSummaryAction } from "@/app/(app)/projects/[projectId]/actions";

import styles from "./AiProjectSummaryCard.module.scss";

interface AiProjectSummaryCardProps {
  agencyId: string;
  projectId: string;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const AiProjectSummaryCard = ({ agencyId, projectId }: AiProjectSummaryCardProps) => {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await generateProjectSummaryAction(agencyId, projectId);
      if (result.draft) {
        setDraft(result.draft);
      } else {
        setError(result.error ?? "Unable to draft a summary");
      }
    });
  };

  const handleCopy = async () => {
    if (!draft) return;
    setCopied(await copyToClipboard(draft));
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.eyebrow}>
          <Sparkles className={styles.eyebrowIcon} aria-hidden="true" />
          AI status update
        </span>
        <button type="button" className={styles.generate} onClick={handleGenerate} disabled={isPending}>
          {isPending ? "Drafting…" : draft ? "Regenerate" : "Generate update"}
        </button>
      </div>

      {!draft && !error && !isPending && (
        <p className={styles.hint}>Draft a client-ready status update from this project&apos;s board in one click.</p>
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
          </div>
        </>
      )}
    </div>
  );
};

export default AiProjectSummaryCard;

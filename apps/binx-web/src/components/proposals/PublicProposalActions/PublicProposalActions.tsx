/**
 * PublicProposalActions.tsx
 *
 * The sign / decline form a recipient sees on the public share-token page.
 * Only rendered for a proposal that's still awaiting a decision (sent or
 * viewed) — the page itself shows read-only signature / decline info once
 * one has been made. Calls the co-located public `"use server"` actions,
 * which wrap `signPublicProposal` / `declinePublicProposal` — no auth header,
 * the token alone scopes the request.
 *
 * @module apps/binx-web/src/components/proposals/PublicProposalActions/PublicProposalActions.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { declinePublicProposalAction, signPublicProposalAction } from "@/app/proposals/public/actions";

import styles from "./PublicProposalActions.module.scss";

interface PublicProposalActionsProps {
  token: string;
  recipientName?: string | null;
}

type Mode = "choose" | "sign" | "decline";

const PublicProposalActions = ({ token, recipientName }: PublicProposalActionsProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("choose");
  const [signerName, setSignerName] = useState(recipientName ?? "");
  const [signerEmail, setSignerEmail] = useState("");
  const [reason, setReason] = useState("");

  const handleSign = (event: React.FormEvent) => {
    event.preventDefault();
    if (signerName.trim() === "" || signerEmail.trim() === "" || isPending) return;
    startTransition(async () => {
      const result = await signPublicProposalAction(token, signerName.trim(), signerEmail.trim());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleDecline = (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending) return;
    startTransition(async () => {
      const result = await declinePublicProposalAction(token, reason.trim() || null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (mode === "choose") {
    return (
      <div className={styles.choose}>
        <button type="button" className={styles.primary} onClick={() => setMode("sign")}>
          Sign this proposal
        </button>
        <button type="button" className={styles.ghost} onClick={() => setMode("decline")}>
          Decline
        </button>
      </div>
    );
  }

  if (mode === "sign") {
    return (
      <form className={styles.form} onSubmit={handleSign}>
        <label className={styles.field}>
          <span className={styles.label}>Your name</span>
          <input
            className={styles.input}
            value={signerName}
            onChange={(event) => setSignerName(event.target.value)}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Your email</span>
          <input
            type="email"
            className={styles.input}
            value={signerEmail}
            onChange={(event) => setSignerEmail(event.target.value)}
            required
          />
        </label>
        <div className={styles.formActions}>
          <button type="button" className={styles.ghost} onClick={() => setMode("choose")}>
            Back
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={isPending || signerName.trim() === "" || signerEmail.trim() === ""}
          >
            {isPending ? "Signing…" : "Sign proposal"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleDecline}>
      <label className={styles.field}>
        <span className={styles.label}>Reason (optional)</span>
        <textarea
          className={styles.textarea}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className={styles.formActions}>
        <button type="button" className={styles.ghost} onClick={() => setMode("choose")}>
          Back
        </button>
        <button type="submit" className={styles.dangerSolid} disabled={isPending}>
          {isPending ? "Declining…" : "Decline proposal"}
        </button>
      </div>
    </form>
  );
};

export default PublicProposalActions;

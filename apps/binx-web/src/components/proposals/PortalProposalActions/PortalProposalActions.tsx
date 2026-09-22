/**
 * PortalProposalActions.tsx
 *
 * The sign / decline control a signed-in client contact sees on their own
 * portal proposal page. Only rendered while the proposal is still awaiting a
 * decision (sent or viewed). Unlike the public share-token flow, the portal
 * already knows who the signer is — signing is a single click, no name/email
 * to type.
 *
 * @module apps/binx-web/src/components/proposals/PortalProposalActions/PortalProposalActions.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { declinePortalProposalAction, signPortalProposalAction } from "@/app/(portal)/portal/proposals/actions";

import styles from "./PortalProposalActions.module.scss";

interface PortalProposalActionsProps {
  proposalId: string;
}

type Mode = "choose" | "decline";

const PortalProposalActions = ({ proposalId }: PortalProposalActionsProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("choose");
  const [reason, setReason] = useState("");

  const handleSign = () => {
    if (isPending) return;
    startTransition(async () => {
      const result = await signPortalProposalAction(proposalId);
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
      const result = await declinePortalProposalAction(proposalId, reason.trim() || null);
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
        <button type="button" className={styles.primary} disabled={isPending} onClick={handleSign}>
          {isPending ? "Signing…" : "Sign this proposal"}
        </button>
        <button type="button" className={styles.ghost} disabled={isPending} onClick={() => setMode("decline")}>
          Decline
        </button>
      </div>
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
        <button type="button" className={styles.ghost} disabled={isPending} onClick={() => setMode("choose")}>
          Back
        </button>
        <button type="submit" className={styles.dangerSolid} disabled={isPending}>
          {isPending ? "Declining…" : "Decline proposal"}
        </button>
      </div>
    </form>
  );
};

export default PortalProposalActions;

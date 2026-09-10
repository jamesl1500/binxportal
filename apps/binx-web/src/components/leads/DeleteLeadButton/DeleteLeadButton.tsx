/**
 * DeleteLeadButton.tsx
 *
 * Permanently deletes a lead (owner/admin only). A typed-confirm-free two-tap
 * flow — leads are lighter than clients, so a plain confirm row is enough.
 * `deleteLeadAction` redirects to `/leads` on success.
 *
 * @module apps/binx-web/src/components/leads/DeleteLeadButton/DeleteLeadButton.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteLeadAction } from "@/app/(app)/leads/actions";

import styles from "./DeleteLeadButton.module.scss";

interface DeleteLeadButtonProps {
  agencyId: string;
  leadId: string;
  leadName: string;
}

const DeleteLeadButton = ({ agencyId, leadId, leadName }: DeleteLeadButtonProps) => {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteLeadAction(agencyId, leadId);
      if (result?.error) toast.error(result.error);
    });
  };

  if (confirming) {
    return (
      <div className={styles.row}>
        <span className={styles.prompt}>Delete {leadName}?</span>
        <button type="button" className={styles.delete} onClick={handleDelete} disabled={isPending}>
          {isPending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" className={styles.cancel} onClick={() => setConfirming(false)} disabled={isPending}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button type="button" className={styles.trigger} onClick={() => setConfirming(true)}>
      <Trash2 aria-hidden="true" /> Delete lead
    </button>
  );
};

export default DeleteLeadButton;

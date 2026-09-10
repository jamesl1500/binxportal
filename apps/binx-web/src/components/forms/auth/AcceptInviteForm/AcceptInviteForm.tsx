/**
 * AcceptInviteForm.tsx
 *
 * Renders the invitation's details (read-only, for reassurance) and a button
 * that accepts it using the token from the emailed link. No success state to
 * render here — `acceptInviteAction` redirects to the dashboard on success,
 * same shape as ConfirmEmailChangeForm but without the inline success message.
 *
 * @module apps/binx-web/src/components/forms/auth/AcceptInviteForm/AcceptInviteForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";

import { acceptInviteAction } from "@/app/(auth)/auth/accept-invite/actions";
import type { AgencyInvitationPreview } from "@/lib/agencies";

import styles from "./AcceptInviteForm.module.scss";

interface AcceptInviteFormProps {
  /** The invitation token from the emailed link — this alone authorizes the request. */
  token: string;
  /** The invitation's details, shown read-only for reassurance before accepting. */
  preview: AgencyInvitationPreview;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const AcceptInviteForm = ({ token, preview }: AcceptInviteFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const handleAccept = () => {
    setFormError(null);

    startTransition(async () => {
      const result = await acceptInviteAction(token);
      // A successful accept redirects server-side and never returns here.
      if (result?.error) {
        setFormError(result.error);
      }
    });
  };

  return (
    <div className={styles.form}>
      <dl className={styles.summary}>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>Agency</dt>
          <dd className={styles.summaryValue}>{preview.agency_name}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>Role</dt>
          <dd className={styles.summaryValue}>{capitalize(preview.role)}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>Invited by</dt>
          <dd className={styles.summaryValue}>{preview.invited_by_name}</dd>
        </div>
      </dl>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button className={styles.submit} type="button" onClick={handleAccept} disabled={isPending}>
        {isPending ? "Joining…" : `Join ${preview.agency_name}`}
      </button>
    </div>
  );
};

export default AcceptInviteForm;

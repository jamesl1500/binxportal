/**
 * AcceptPortalInviteForm.tsx
 *
 * Shows the client-portal invitation's details and a button that accepts it.
 * `acceptPortalInviteAction` redirects into `/portal` on success, so there's
 * no success state here — only an inline error.
 *
 * @module apps/binx-web/src/components/forms/portal/AcceptPortalInviteForm/AcceptPortalInviteForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";

import { acceptPortalInviteAction } from "@/app/(auth)/auth/portal-invite/actions";
import type { PortalInvitationPreview } from "@/lib/portal";

import styles from "./AcceptPortalInviteForm.module.scss";

interface AcceptPortalInviteFormProps {
  token: string;
  preview: PortalInvitationPreview;
}

const AcceptPortalInviteForm = ({ token, preview }: AcceptPortalInviteFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const handleAccept = () => {
    setFormError(null);
    startTransition(async () => {
      const result = await acceptPortalInviteAction(token);
      if (result?.error) setFormError(result.error);
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
          <dt className={styles.summaryLabel}>Client account</dt>
          <dd className={styles.summaryValue}>{preview.client_name}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt className={styles.summaryLabel}>Invited by</dt>
          <dd className={styles.summaryValue}>{preview.invited_by_name}</dd>
        </div>
      </dl>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button className={styles.submit} type="button" onClick={handleAccept} disabled={isPending}>
        {isPending ? "Joining…" : `Enter ${preview.client_name}'s portal`}
      </button>
    </div>
  );
};

export default AcceptPortalInviteForm;

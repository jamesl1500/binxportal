/**
 * Confirm Email Change Form
 *
 * Renders the pending new email address (read-only, for reassurance) and a
 * button that confirms the change using the token from the emailed link.
 *
 * @module apps/binx-web/src/components/forms/auth/ConfirmEmailChangeForm/ConfirmEmailChangeForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";

import { confirmEmailChangeAction } from "@/app/(auth)/auth/confirm-email/actions";

import styles from "./ConfirmEmailChangeForm.module.scss";

interface ConfirmEmailChangeFormProps {
  /** The confirmation token from the emailed link — this alone authorizes the request. */
  token: string;
  /** The pending new email address, shown read-only for reassurance; not sent to the server. */
  newEmail: string;
}

const ConfirmEmailChangeForm = ({ token, newEmail }: ConfirmEmailChangeFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleConfirm = () => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await confirmEmailChangeAction(token);

      if (result.error) {
        setFormError(result.error);
      } else if (result.message) {
        setSuccessMessage(result.message);
      }
    });
  };

  if (successMessage) {
    return <p className={styles.formSuccess}>{successMessage}</p>;
  }

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="newEmail">
          New email
        </label>
        <input className={styles.input} id="newEmail" type="email" value={newEmail} readOnly disabled />
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button className={styles.submit} type="button" onClick={handleConfirm} disabled={isPending}>
        {isPending ? "Confirming…" : "Confirm email change"}
      </button>
    </div>
  );
};

export default ConfirmEmailChangeForm;

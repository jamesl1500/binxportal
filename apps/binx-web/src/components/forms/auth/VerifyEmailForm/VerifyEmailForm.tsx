/**
 * Verify Email Form
 *
 * Renders the form for verifying a user's email address.
 *
 * @module apps/binx-web/src/components/forms/auth/VerifyEmailForm/VerifyEmailForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";

import { verifyEmailAction } from "@/app/(auth)/auth/verify-email/actions";

import styles from "./VerifyEmailForm.module.scss";

interface VerifyEmailFormProps {
  /** The verification token from the emailed link — this alone authorizes the request. */
  token: string;
  /** Shown read-only for reassurance; not sent to the server. */
  email?: string;
  /** Carried through from signup when this account came from a client-portal invite — sends the user back to accept it instead of staff onboarding. */
  portalInviteToken?: string;
}

/**
 * Verify Email Form Component
 *
 * Shows the account's email (read-only) and a button that triggers
 * verification using the token from the emailed link.
 *
 * @returns {JSX.Element} The rendered verify email form component.
 */
const VerifyEmailForm = ({ token, email, portalInviteToken }: VerifyEmailFormProps) => {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const handleVerify = () => {
    setFormError(null);

    startTransition(async () => {
      const result = await verifyEmailAction(token, portalInviteToken);

      if (result.error) {
        setFormError(result.error);
      }
    });
  };

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input className={styles.input} id="email" type="email" value={email ?? ""} readOnly disabled />
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}

      <button className={styles.submit} type="button" onClick={handleVerify} disabled={isPending}>
        {isPending ? "Verifying…" : "Verify Email"}
      </button>
    </div>
  );
};

export default VerifyEmailForm;

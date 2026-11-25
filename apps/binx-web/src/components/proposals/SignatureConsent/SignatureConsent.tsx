/**
 * SignatureConsent.tsx
 *
 * The e-sign consent a recipient has to accept before signing, shared by
 * the share-link and client-portal sign forms. Shows binx-api's consent
 * wording verbatim (the signature records that exact text and its version)
 * and the fingerprint of the document being signed, so the signer can see
 * what their signature is tied to.
 *
 * @module apps/binx-web/src/components/proposals/SignatureConsent/SignatureConsent.tsx
 * @author Binx Portal
 */
"use client";

import { useId } from "react";

import styles from "./SignatureConsent.module.scss";

interface SignatureConsentProps {
  consentText: string;
  documentHash: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** "3f9a1c…b27e": enough to compare against the certificate at a glance. */
export function shortFingerprint(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

const SignatureConsent = ({
  consentText,
  documentHash,
  checked,
  onChange,
}: SignatureConsentProps) => {
  const id = useId();

  return (
    <div className={styles.consent}>
      <label className={styles.agree} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className={styles.checkbox}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{consentText}</span>
      </label>
      {documentHash && (
        <p className={styles.fingerprint}>
          You&apos;re signing document{" "}
          <code title={documentHash}>{shortFingerprint(documentHash)}</code>.
          The signed record keeps this fingerprint, so this exact version can
          always be proven.
        </p>
      )}
    </div>
  );
};

export default SignatureConsent;

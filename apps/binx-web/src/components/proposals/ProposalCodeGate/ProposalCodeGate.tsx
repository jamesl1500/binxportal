/**
 * ProposalCodeGate.tsx
 *
 * What a share link shows for a proposal protected by an email code,
 * before the visitor has verified: who it's from and what it's called, then
 * "Email me a code" (it only ever goes to the recipient's address, shown
 * masked) and a box for the code. A correct code sets the access cookie
 * and refreshes the page, which then opens (see `lib/proposal-access.ts`).
 *
 * @module apps/binx-web/src/components/proposals/ProposalCodeGate/ProposalCodeGate.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  requestProposalCodeAction,
  verifyProposalCodeAction,
} from "@/app/proposals/public/actions";

import styles from "./ProposalCodeGate.module.scss";

interface ProposalCodeGateProps {
  token: string;
  agencyName: string;
  title: string;
  emailHint: string;
  /** What's behind the gate, for the copy: the proposal or its certificate. */
  what?: string;
}

const ProposalCodeGate = ({
  token,
  agencyName,
  title,
  emailHint,
  what = "this proposal",
}: ProposalCodeGateProps) => {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const [isChecking, startChecking] = useTransition();

  const sendCode = () => {
    setError(null);
    startSending(async () => {
      const result = await requestProposalCodeAction(token);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSent(true);
      toast.success(`Code sent to ${result.emailHint ?? emailHint}`);
    });
  };

  const checkCode = (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || isChecking) return;
    setError(null);
    startChecking(async () => {
      const result = await verifyProposalCodeAction(token, code.trim());
      if (result.error) setError(result.error);
    });
  };

  return (
    <div className={styles.gate}>
      {agencyName && <span className={styles.eyebrow}>{agencyName}</span>}
      <h1 className={styles.title}>{title || "Proposal"}</h1>
      <p className={styles.lead}>
        {agencyName || "The agency"} protects {what} with a code. We&apos;ll
        email one to <strong>{emailHint}</strong>, the address it was sent to.
      </p>

      {sent ? (
        <form className={styles.form} onSubmit={checkCode}>
          <label className={styles.field}>
            <span className={styles.label}>Code from the email</span>
            <input
              className={styles.input}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "proposal-code-error" : undefined}
              autoFocus
            />
          </label>
          {error && (
            <p id="proposal-code-error" className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primary}
              disabled={!code.trim() || isChecking}
            >
              {isChecking ? "Checking…" : "Open"}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={sendCode}
              disabled={isSending}
            >
              {isSending ? "Sending…" : "Send a new code"}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={sendCode}
            disabled={isSending}
          >
            {isSending ? "Sending…" : "Email me a code"}
          </button>
        </div>
      )}

      <p className={styles.note}>
        Not your address? Ask {agencyName || "the agency"} to send it to the
        right one.
      </p>
    </div>
  );
};

export default ProposalCodeGate;

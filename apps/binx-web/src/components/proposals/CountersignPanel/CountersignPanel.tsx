/**
 * CountersignPanel.tsx
 *
 * On a proposal the client has signed that needs the agency's
 * countersignature: owners and admins sign for the agency (same consent and
 * document fingerprint as the client), which completes the proposal and
 * emails both parties the signed PDF. Members see who can sign instead.
 *
 * @module apps/binx-web/src/components/proposals/CountersignPanel/CountersignPanel.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import { PenLine } from "lucide-react";
import { toast } from "sonner";

import SignatureConsent from "@/components/proposals/SignatureConsent/SignatureConsent";
import { countersignProposalAction } from "@/app/(app)/proposals/actions";

import styles from "./CountersignPanel.module.scss";

interface CountersignPanelProps {
  agencyId: string;
  proposalId: string;
  clientName: string;
  consentText: string;
  documentHash: string | null;
  /** Owners and admins can countersign; members can't. */
  canSign: boolean;
  /** The signed-in person, whose name becomes the signature. */
  signerName: string;
}

const CountersignPanel = ({
  agencyId,
  proposalId,
  clientName,
  consentText,
  documentHash,
  canSign,
  signerName,
}: CountersignPanelProps) => {
  const [consent, setConsent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSign = (event: React.FormEvent) => {
    event.preventDefault();
    if (!consent || isPending) return;
    startTransition(async () => {
      const result = await countersignProposalAction(
        agencyId,
        proposalId,
        consent,
        documentHash,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Countersigned. Both parties have been sent the signed PDF.");
    });
  };

  return (
    <section className={styles.panel} aria-labelledby="countersign-title">
      <div className={styles.head}>
        <PenLine aria-hidden="true" />
        <div>
          <h2 id="countersign-title" className={styles.title}>
            Ready for your countersignature
          </h2>
          <p className={styles.subtitle}>
            {clientName} has signed. Countersign for the agency to complete the
            proposal; both of you then get the signed PDF.
          </p>
        </div>
      </div>

      {canSign ? (
        <form className={styles.form} onSubmit={handleSign}>
          <SignatureConsent
            consentText={consentText}
            documentHash={documentHash}
            checked={consent}
            onChange={setConsent}
          />
          <div className={styles.actions}>
            <span className={styles.as}>Signing as {signerName}</span>
            <button
              type="submit"
              className={styles.primary}
              disabled={!consent || isPending}
            >
              {isPending ? "Countersigning…" : "Countersign proposal"}
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.note}>
          An owner or admin of the agency needs to countersign.
        </p>
      )}
    </section>
  );
};

export default CountersignPanel;

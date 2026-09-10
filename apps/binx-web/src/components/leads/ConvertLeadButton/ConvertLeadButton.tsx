/**
 * ConvertLeadButton.tsx
 *
 * Turns a lead into a real `AgencyClient`. A confirm step first (it's not
 * reversible), then `convertLeadAction` — which redirects to the new client
 * on success. Once converted this renders a link to the client instead.
 *
 * @module apps/binx-web/src/components/leads/ConvertLeadButton/ConvertLeadButton.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { convertLeadAction } from "@/app/(app)/leads/actions";

import styles from "./ConvertLeadButton.module.scss";

interface ConvertLeadButtonProps {
  agencyId: string;
  leadId: string;
  leadName: string;
  convertedClientId: string | null;
  convertedClientName: string | null;
}

const ConvertLeadButton = ({
  agencyId,
  leadId,
  leadName,
  convertedClientId,
  convertedClientName,
}: ConvertLeadButtonProps) => {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (convertedClientId) {
    return (
      <p className={styles.done}>
        Converted to{" "}
        <Link href={`/clients/${convertedClientId}`} className={styles.link}>
          {convertedClientName ?? "the client"}
        </Link>
        .
      </p>
    );
  }

  const handleConvert = () => {
    startTransition(async () => {
      // A successful convert redirects server-side and never returns.
      const result = await convertLeadAction(agencyId, leadId);
      if (result?.error) toast.error(result.error);
    });
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.blurb}>
        Create a client from <strong>{leadName}</strong> — carries over the contact details and notes, marks this
        lead <em>Won</em>.
      </p>
      {confirming ? (
        <div className={styles.confirmRow}>
          <button type="button" className={styles.convert} onClick={handleConvert} disabled={isPending}>
            {isPending ? "Converting…" : "Yes, convert"}
          </button>
          <button type="button" className={styles.cancel} onClick={() => setConfirming(false)} disabled={isPending}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={styles.convert} onClick={() => setConfirming(true)}>
          Convert to client
        </button>
      )}
    </div>
  );
};

export default ConvertLeadButton;

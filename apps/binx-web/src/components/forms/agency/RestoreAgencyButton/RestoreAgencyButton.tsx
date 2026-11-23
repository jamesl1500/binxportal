/**
 * RestoreAgencyButton.tsx
 *
 * Takes an agency off its 30-day deletion hold. On success the server action
 * selects the agency and redirects to its dashboard, so only a failure (a
 * full plan, or Stripe being unavailable) renders anything here.
 *
 * @module apps/binx-web/src/components/forms/agency/RestoreAgencyButton/RestoreAgencyButton.tsx
 */
"use client";

import { useState, useTransition } from "react";

import { restoreAgencyAction } from "@/app/(app)/settings/actions";

import styles from "./RestoreAgencyButton.module.scss";

interface RestoreAgencyButtonProps {
  agencyId: string;
  agencyName: string;
}

const RestoreAgencyButton = ({
  agencyId,
  agencyName,
}: RestoreAgencyButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const restore = () => {
    setError(null);
    startTransition(async () => {
      const result = await restoreAgencyAction(agencyId);
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={restore}
        disabled={isPending}
        aria-label={`Restore ${agencyName}`}
      >
        {isPending ? "Restoring…" : "Restore agency"}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default RestoreAgencyButton;

/**
 * ArchiveClientButton.tsx
 *
 * Toggles a client between active and archived. Reversible, so unlike
 * DeleteClientForm this has no type-to-confirm step — just a plain confirm()
 * before archiving (restoring needs no confirmation at all). Shared between
 * ClientsTable's row action and the client detail page's Status section,
 * hence the `compact` prop for the tighter table-row styling.
 *
 * @module apps/binx-web/src/components/forms/clients/ArchiveClientButton/ArchiveClientButton.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setClientActiveAction } from "@/app/(app)/clients/actions";
import type { AgencyClient } from "@/lib/clients";

import styles from "./ArchiveClientButton.module.scss";

interface ArchiveClientButtonProps {
  agencyId: string;
  client: Pick<AgencyClient, "id" | "name" | "is_active">;
  compact?: boolean;
  onChanged?: (client: AgencyClient) => void;
}

const ArchiveClientButton = ({ agencyId, client, compact, onChanged }: ArchiveClientButtonProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    if (
      client.is_active &&
      typeof window !== "undefined" &&
      !window.confirm(`Archive ${client.name}? You can restore it later.`)
    ) {
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await setClientActiveAction(agencyId, client.id, !client.is_active);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.client && onChanged) {
        onChanged(result.client);
      }
      router.refresh();
    });
  };

  return (
    <div className={compact ? styles.compactWrapper : styles.wrapper}>
      <button
        type="button"
        className={client.is_active ? styles.archiveButton : styles.restoreButton}
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "…" : client.is_active ? "Archive" : "Restore"}
      </button>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default ArchiveClientButton;

/**
 * ArchiveClientButton.tsx
 *
 * Toggles a client between active and archived. Reversible, so unlike
 * DeleteClientForm this has no type-to-confirm step — just a ConfirmDialog
 * before archiving (restoring needs no confirmation at all). Shared between
 * ClientsTable's row action and the client detail page's Status section,
 * hence the `compact` prop for the tighter table-row styling.
 *
 * @module apps/binx-web/src/components/forms/clients/ArchiveClientButton/ArchiveClientButton.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";

import { setClientActiveAction } from "@/app/(app)/clients/actions";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import type { AgencyClient } from "@/lib/clients";

import styles from "./ArchiveClientButton.module.scss";

interface ArchiveClientButtonProps {
  agencyId: string;
  client: Pick<AgencyClient, "id" | "name" | "is_active">;
  compact?: boolean;
  onChanged?: (client: AgencyClient) => void;
}

const ArchiveClientButton = ({
  agencyId,
  client,
  compact,
  onChanged,
}: ArchiveClientButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const handleClick = async () => {
    if (client.is_active) {
      const confirmed = await confirm({
        title: `Archive ${client.name}?`,
        description:
          "It moves to your archived clients. You can restore it later.",
        confirmLabel: "Archive client",
      });
      if (!confirmed) return;
    }

    setError(null);

    startTransition(async () => {
      const result = await setClientActiveAction(
        agencyId,
        client.id,
        !client.is_active,
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.client && onChanged) {
        onChanged(result.client);
      }
    });
  };

  return (
    <div className={compact ? styles.compactWrapper : styles.wrapper}>
      <button
        type="button"
        className={
          client.is_active ? styles.archiveButton : styles.restoreButton
        }
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
      {dialog}
    </div>
  );
};

export default ArchiveClientButton;

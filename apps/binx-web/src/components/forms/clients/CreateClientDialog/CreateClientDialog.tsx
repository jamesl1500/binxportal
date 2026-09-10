/**
 * CreateClientDialog.tsx
 *
 * The "New client" button on the clients list page, and the modal it opens.
 * Mirrors OrgSwitcher's create-agency dialog: plain component state for
 * `open` (there's no nested-in-a-menu constraint here, but a Dialog.Trigger
 * would work just as well — kept consistent with that pattern anyway), and
 * ClientForm owns the fields while this owns the dialog chrome and refresh.
 *
 * @module apps/binx-web/src/components/forms/clients/CreateClientDialog/CreateClientDialog.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Plus } from "lucide-react";

import ClientForm from "@/components/forms/clients/ClientForm/ClientForm";

import styles from "./CreateClientDialog.module.scss";

interface CreateClientDialogProps {
  agencyId: string;
}

const CreateClientDialog = ({ agencyId }: CreateClientDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleCreated = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <Plus className={styles.plusIcon} aria-hidden="true" />
        New client
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Add a new client">
            <Dialog.Title className={styles.dialogTitle}>Add a new client</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Only the name is required — you can fill in contact details and notes any time.
            </Dialog.Description>

            <ClientForm agencyId={agencyId} onSuccess={handleCreated} onCancel={() => setOpen(false)} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default CreateClientDialog;

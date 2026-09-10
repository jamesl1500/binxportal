/**
 * CreateLeadDialog.tsx
 *
 * The "New lead" button on the leads list page and the modal it opens.
 * Mirrors `forms/clients/CreateClientDialog` — plain `open` state, `LeadForm`
 * owns the fields, this owns the dialog chrome and the route refresh.
 *
 * @module apps/binx-web/src/components/leads/CreateLeadDialog/CreateLeadDialog.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Plus } from "lucide-react";

import LeadForm from "@/components/leads/LeadForm/LeadForm";

import styles from "./CreateLeadDialog.module.scss";

interface CreateLeadDialogProps {
  agencyId: string;
}

const CreateLeadDialog = ({ agencyId }: CreateLeadDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
        <Plus className={styles.plusIcon} aria-hidden="true" />
        New lead
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Add a new lead">
            <Dialog.Title className={styles.dialogTitle}>Add a new lead</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Just a name to start — you can fill in the rest and work it from the lead&apos;s page.
            </Dialog.Description>

            <LeadForm
              agencyId={agencyId}
              onSuccess={() => {
                setOpen(false);
                router.refresh();
              }}
              onCancel={() => setOpen(false)}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default CreateLeadDialog;

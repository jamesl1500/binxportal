/**
 * EditMeetingDialog.tsx
 *
 * The "Edit" button on a scheduled meeting row (MeetingsTable) and the modal
 * it opens — ScheduleMeetingForm in edit mode (the `meeting` prop), same
 * dialog chrome as ScheduleMeetingDialog. Kept as its own trigger/component
 * rather than folding into ScheduleMeetingDialog since it's rendered once
 * per table row, not once per page.
 *
 * @module apps/binx-web/src/components/forms/meetings/EditMeetingDialog/EditMeetingDialog.tsx
 * @author Binx.io
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { Pencil } from "lucide-react";

import ScheduleMeetingForm from "@/components/forms/meetings/ScheduleMeetingForm/ScheduleMeetingForm";
import type { Meeting } from "@/lib/meetings";

import styles from "./EditMeetingDialog.module.scss";

interface ClientOption {
  id: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
  client_id: string;
}

interface EditMeetingDialogProps {
  agencyId: string;
  meeting: Meeting;
  clients: ClientOption[];
  projects: ProjectOption[];
}

const EditMeetingDialog = ({ agencyId, meeting, clients, projects }: EditMeetingDialogProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleUpdated = () => {
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label="Edit meeting">
        <Pencil aria-hidden="true" />
        Edit
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Edit meeting">
            <Dialog.Title className={styles.dialogTitle}>Edit meeting</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              Rescheduling notifies the client of the new time.
            </Dialog.Description>

            <ScheduleMeetingForm
              agencyId={agencyId}
              clients={clients}
              projects={projects}
              meeting={meeting}
              onSuccess={handleUpdated}
              onCancel={() => setOpen(false)}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default EditMeetingDialog;

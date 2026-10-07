/**
 * ScheduleMeetingDialog.tsx
 *
 * The "Schedule meeting" button on the agency-wide and per-client Meetings
 * pages, and the modal it opens: plain `open` state, ScheduleMeetingForm
 * owns the fields, this owns the dialog chrome and refresh-on-success.
 *
 * @module apps/binx-web/src/components/forms/meetings/ScheduleMeetingDialog/ScheduleMeetingDialog.tsx
 * @author Binx Portal
 */
"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Plus } from "lucide-react";

import ScheduleMeetingForm from "@/components/forms/meetings/ScheduleMeetingForm/ScheduleMeetingForm";

import styles from "./ScheduleMeetingDialog.module.scss";

interface ClientOption {
  id: string;
  name: string;
}
interface ProjectOption {
  id: string;
  name: string;
  client_id: string;
}

interface ScheduleMeetingDialogProps {
  agencyId: string;
  clients: ClientOption[];
  projects: ProjectOption[];
  defaultClientId?: string;
  defaultProjectId?: string;
  /** A small text-style trigger ("+ Schedule") for card headers, e.g. the project dashboard's Meetings widget. */
  compact?: boolean;
}

const ScheduleMeetingDialog = ({
  agencyId,
  clients,
  projects,
  defaultClientId,
  defaultProjectId,
  compact = false,
}: ScheduleMeetingDialogProps) => {
  const [open, setOpen] = useState(false);

  const handleScheduled = () => {
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={compact ? styles.compactTrigger : styles.trigger}
        onClick={() => setOpen(true)}
        aria-label={compact ? "Schedule meeting" : undefined}
      >
        <Plus className={styles.plusIcon} aria-hidden="true" />
        {compact ? "Schedule" : "Schedule meeting"}
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup
            className={styles.dialog}
            aria-label="Schedule a meeting"
          >
            <Dialog.Title className={styles.dialogTitle}>
              Schedule a meeting
            </Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              This is scheduled immediately — the client will be notified.
            </Dialog.Description>

            <ScheduleMeetingForm
              agencyId={agencyId}
              clients={clients}
              projects={projects}
              defaultClientId={defaultClientId}
              defaultProjectId={defaultProjectId}
              onSuccess={handleScheduled}
              onCancel={() => setOpen(false)}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default ScheduleMeetingDialog;

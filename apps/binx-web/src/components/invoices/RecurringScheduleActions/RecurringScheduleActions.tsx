/**
 * RecurringScheduleActions.tsx
 *
 * Per-row actions for a recurring-invoice schedule: Pause/Resume (toggles
 * `is_active`), Run now (generates an invoice immediately, ignoring
 * `next_run_date`), and Delete. Run now and Delete go through a confirm
 * dialog since both have side effects that can't be undone from here.
 * Owner/admin only — everyone else sees nothing.
 *
 * There is no edit action in this first pass: schedules can be paused and
 * recreated instead of edited in place (see the "recurring/new" page).
 *
 * @module apps/binx-web/src/components/invoices/RecurringScheduleActions/RecurringScheduleActions.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";

import type { RecurringSchedule } from "@/lib/recurring-invoices";
import {
  deleteRecurringScheduleAction,
  pauseRecurringScheduleAction,
  resumeRecurringScheduleAction,
  runRecurringScheduleNowAction,
} from "@/app/(app)/invoices/recurring/actions";

import styles from "./RecurringScheduleActions.module.scss";

interface RecurringScheduleActionsProps {
  agencyId: string;
  schedule: RecurringSchedule;
  /** True for owners/admins — gates every action here. */
  canManage: boolean;
}

const RecurringScheduleActions = ({ agencyId, schedule, canManage }: RecurringScheduleActionsProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [runNowOpen, setRunNowOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!canManage) {
    return null;
  }

  const run = (action: () => Promise<{ error?: string }>, successMessage?: string) => {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (successMessage) {
        toast.success(successMessage);
      }
      router.refresh();
    });
  };

  return (
    <div className={styles.bar}>
      {schedule.is_active ? (
        <button
          type="button"
          className={styles.ghost}
          disabled={isPending}
          onClick={() => run(() => pauseRecurringScheduleAction(agencyId, schedule.id), "Schedule paused")}
        >
          Pause
        </button>
      ) : (
        <button
          type="button"
          className={styles.ghost}
          disabled={isPending}
          onClick={() => run(() => resumeRecurringScheduleAction(agencyId, schedule.id), "Schedule resumed")}
        >
          Resume
        </button>
      )}

      <button type="button" className={styles.ghost} disabled={isPending} onClick={() => setRunNowOpen(true)}>
        Run now
      </button>

      <button type="button" className={styles.ghostDanger} disabled={isPending} onClick={() => setDeleteOpen(true)}>
        Delete
      </button>

      <Dialog.Root open={runNowOpen} onOpenChange={setRunNowOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Run this schedule now">
            <Dialog.Title className={styles.dialogTitle}>Run &ldquo;{schedule.title}&rdquo; now?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              This generates an invoice immediately, ignoring the next run date, and advances the schedule.
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setRunNowOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const result = await runRecurringScheduleNowAction(agencyId, schedule.id);
                    if (!result.error) setRunNowOpen(false);
                    return result;
                  }, "Invoice generated")
                }
              >
                Run now
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Delete this schedule">
            <Dialog.Title className={styles.dialogTitle}>Delete &ldquo;{schedule.title}&rdquo;?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              This can&apos;t be undone. Invoices it already generated are untouched.
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerSolid}
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    const result = await deleteRecurringScheduleAction(agencyId, schedule.id);
                    if (!result.error) setDeleteOpen(false);
                    return result;
                  }, "Schedule deleted")
                }
              >
                Delete schedule
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default RecurringScheduleActions;

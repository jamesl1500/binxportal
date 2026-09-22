/**
 * TimerWidget.tsx
 *
 * The live start/stop timer on a project's Time tab. When the caller has no
 * running timer anywhere in this agency, shows a "Start timer" button that
 * opens a modal with the start form (optional task, description, billable
 * toggle) scoped to this project. When one is running — whether started from
 * here or from another project — shows the elapsed time ticking client-side
 * from `started_at` (binx-api never stores a running entry's duration, see
 * time_tracking/models.py) and a Stop button, inline, since that's live
 * status rather than an action to configure.
 *
 * @module apps/binx-web/src/components/forms/projects/TimerWidget/TimerWidget.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { toast } from "sonner";

import { startTimerAction, stopTimerAction } from "@/app/(app)/projects/[projectId]/time/actions";
import type { TimeEntry } from "@/lib/time-tracking";

import styles from "./TimerWidget.module.scss";

export interface TaskOption {
  id: string;
  title: string;
}

interface TimerWidgetProps {
  agencyId: string;
  projectId: string;
  tasks: TaskOption[];
  /** The caller's agency-wide running timer, if any — null if nothing is running. */
  runningTimer: TimeEntry | null;
}

/** Milliseconds since `startedAt` → "HH:MM:SS". */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

const TimerWidget = ({ agencyId, projectId, tasks, runningTimer }: TimerWidgetProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const [dialogOpen, setDialogOpen] = useState(false);

  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [isBillable, setIsBillable] = useState(true);

  // Tick once a second while a timer is running so the elapsed label stays live.
  useEffect(() => {
    if (!runningTimer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [runningTimer]);

  const elapsedLabel = useMemo(() => {
    if (!runningTimer) return "00:00:00";
    return formatElapsed(now - new Date(runningTimer.started_at).getTime());
  }, [runningTimer, now]);

  const resetForm = () => {
    setTaskId("");
    setDescription("");
    setIsBillable(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) resetForm();
  };

  const handleStart = () => {
    startTransition(async () => {
      const result = await startTimerAction(agencyId, projectId, {
        projectId,
        taskId: taskId || null,
        description: description.trim() || null,
        isBillable,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      resetForm();
      setDialogOpen(false);
      router.refresh();
    });
  };

  const handleStop = () => {
    if (!runningTimer) return;
    startTransition(async () => {
      const result = await stopTimerAction(agencyId, projectId, runningTimer.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (runningTimer) {
    const onThisProject = runningTimer.project_id === projectId;

    return (
      <div className={styles.card}>
        <div className={styles.runningHeader}>
          <span className={styles.elapsed} aria-live="polite">
            {elapsedLabel}
          </span>
          <span className={styles.badge} data-billable={runningTimer.is_billable}>
            {runningTimer.is_billable ? "Billable" : "Non-billable"}
          </span>
        </div>
        <p className={styles.meta}>
          {onThisProject ? "Running on this project" : `Running on ${runningTimer.project_name}`}
          {runningTimer.task_title ? ` · ${runningTimer.task_title}` : ""}
        </p>
        {runningTimer.description && <p className={styles.description}>{runningTimer.description}</p>}
        <button type="button" className={styles.stop} onClick={handleStop} disabled={isPending}>
          {isPending ? "Stopping…" : "Stop timer"}
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className={styles.startTrigger} onClick={() => setDialogOpen(true)}>
        Start timer
      </button>

      <Dialog.Root open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Start timer">
            <Dialog.Title className={styles.dialogTitle}>Start timer</Dialog.Title>
            <form
              className={styles.dialogForm}
              onSubmit={(event) => {
                event.preventDefault();
                handleStart();
              }}
            >
              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>Task (optional)</span>
                  <select
                    className={styles.select}
                    value={taskId}
                    onChange={(event) => setTaskId(event.target.value)}
                    disabled={isPending}
                  >
                    <option value="">No task</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Description (optional)</span>
                  <input
                    className={styles.input}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What are you working on?"
                    disabled={isPending}
                  />
                </label>
              </div>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={isBillable}
                  onChange={(event) => setIsBillable(event.target.checked)}
                  disabled={isPending}
                />
                Billable
              </label>
              <div className={styles.dialogActions}>
                <button type="button" className={styles.ghost} onClick={() => setDialogOpen(false)} disabled={isPending}>
                  Cancel
                </button>
                <button type="submit" className={styles.start} disabled={isPending}>
                  {isPending ? "Starting…" : "Start"}
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default TimerWidget;

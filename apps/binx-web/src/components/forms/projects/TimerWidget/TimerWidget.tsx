/**
 * TimerWidget.tsx
 *
 * The live start/stop timer at the top of a project's Time tab. When the
 * caller has no running timer anywhere in this agency, shows a small Start
 * form (optional task, description, billable toggle) scoped to this project.
 * When one is running — whether started from here or from another project —
 * shows the elapsed time ticking client-side from `started_at` (binx-api
 * never stores a running entry's duration, see time_tracking/models.py) and a
 * Stop button.
 *
 * @module apps/binx-web/src/components/forms/projects/TimerWidget/TimerWidget.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
      setDescription("");
      setTaskId("");
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
    <form
      className={styles.card}
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
      <button type="submit" className={styles.start} disabled={isPending}>
        {isPending ? "Starting…" : "Start timer"}
      </button>
    </form>
  );
};

export default TimerWidget;

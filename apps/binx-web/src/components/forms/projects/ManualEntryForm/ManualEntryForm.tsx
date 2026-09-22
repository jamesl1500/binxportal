/**
 * ManualEntryForm.tsx
 *
 * Logs a completed time entry directly, without running a timer: task,
 * description, start/end datetime, billable, and an optional per-entry
 * hourly rate override (falls back to the project's default rate when left
 * blank — see resolve_hourly_rate_cents in binx-api's time_tracking/service.py).
 *
 * @module apps/binx-web/src/components/forms/projects/ManualEntryForm/ManualEntryForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { logManualEntryAction } from "@/app/(app)/projects/[projectId]/time/actions";

import styles from "./ManualEntryForm.module.scss";

export interface TaskOption {
  id: string;
  title: string;
}

interface ManualEntryFormProps {
  agencyId: string;
  projectId: string;
  tasks: TaskOption[];
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** A Date → the local "yyyy-MM-ddTHH:mm" value a `datetime-local` input expects. */
function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStartedAt(): string {
  const date = new Date();
  date.setHours(date.getHours() - 1, date.getMinutes(), 0, 0);
  return toLocalInputValue(date);
}

function defaultEndedAt(): string {
  const date = new Date();
  date.setSeconds(0, 0);
  return toLocalInputValue(date);
}

const ManualEntryForm = ({ agencyId, projectId, tasks }: ManualEntryFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [startedAt, setStartedAt] = useState(defaultStartedAt);
  const [endedAt, setEndedAt] = useState(defaultEndedAt);
  const [isBillable, setIsBillable] = useState(true);
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending) return;
    setError(null);

    const startDate = new Date(startedAt);
    const endDate = new Date(endedAt);
    if (!(endDate.getTime() > startDate.getTime())) {
      setError("End time must be after the start time");
      return;
    }

    let hourlyRateCents: number | null = null;
    if (rate.trim()) {
      const parsed = Math.round(Number.parseFloat(rate) * 100);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError("Enter a valid hourly rate");
        return;
      }
      hourlyRateCents = parsed;
    }

    startTransition(async () => {
      const result = await logManualEntryAction(agencyId, projectId, {
        projectId,
        taskId: taskId || null,
        description: description.trim() || null,
        startedAt: startDate.toISOString(),
        endedAt: endDate.toISOString(),
        isBillable,
        hourlyRateCents,
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success("Time entry logged");
      setDescription("");
      setRate("");
      setTaskId("");
      setStartedAt(defaultStartedAt());
      setEndedAt(defaultEndedAt());
      router.refresh();
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
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
            disabled={isPending}
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Start</span>
          <input
            type="datetime-local"
            className={styles.input}
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
            disabled={isPending}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>End</span>
          <input
            type="datetime-local"
            className={styles.input}
            value={endedAt}
            onChange={(event) => setEndedAt(event.target.value)}
            disabled={isPending}
            required
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={isBillable}
            onChange={(event) => setIsBillable(event.target.checked)}
            disabled={isPending}
          />
          Billable
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Hourly rate override (optional)</span>
          <input
            type="number"
            step="0.01"
            className={styles.input}
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            placeholder="Use project default"
            disabled={isPending}
          />
        </label>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Logging…" : "Log time"}
      </button>
    </form>
  );
};

export default ManualEntryForm;

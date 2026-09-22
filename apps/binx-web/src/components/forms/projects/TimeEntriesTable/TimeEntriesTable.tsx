/**
 * TimeEntriesTable.tsx
 *
 * A project's logged time as a table — date, user, task, description,
 * duration, billable, rate, amount, and invoiced status — with edit/delete
 * for entries that aren't invoiced yet (binx-api locks an entry once it's
 * been billed, see _require_not_invoiced in time_tracking/service.py) and
 * checkboxes to select uninvoiced, billable, rated entries to bill onto a new
 * invoice in one go.
 *
 * @module apps/binx-web/src/components/forms/projects/TimeEntriesTable/TimeEntriesTable.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createInvoiceFromTimeEntriesAction,
  deleteTimeEntryAction,
  updateTimeEntryAction,
} from "@/app/(app)/projects/[projectId]/time/actions";
import { formatMoneyCents } from "@/lib/money";
import type { TimeEntry } from "@/lib/time-tracking";

import styles from "./TimeEntriesTable.module.scss";

export interface TaskOption {
  id: string;
  title: string;
}

interface TimeEntriesTableProps {
  agencyId: string;
  projectId: string;
  /** The project's client — required to generate an invoice from selected entries. */
  clientId: string;
  entries: TimeEntry[];
  tasks: TaskOption[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** A Date → the local "yyyy-MM-ddTHH:mm" value a `datetime-local` input expects. */
function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Selectable for invoicing: uninvoiced, billable, stopped, and has a resolved rate — the same rules binx-api enforces in create_invoice_from_entries. */
function isSelectable(entry: TimeEntry): boolean {
  return !entry.invoiced && entry.is_billable && entry.ended_at !== null && entry.amount_cents !== null;
}

const TimeEntriesTable = ({ agencyId, projectId, clientId, entries, tasks }: TimeEntriesTableProps) => {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimeEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editTaskId, setEditTaskId] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsBillable, setEditIsBillable] = useState(true);
  const [editRate, setEditRate] = useState("");
  const [editStartedAt, setEditStartedAt] = useState("");
  const [editEndedAt, setEditEndedAt] = useState("");

  const selectableIds = useMemo(() => entries.filter(isSelectable).map((entry) => entry.id), [entries]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openEdit = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditTaskId(entry.task_id ?? "");
    setEditDescription(entry.description ?? "");
    setEditIsBillable(entry.is_billable);
    setEditRate(entry.hourly_rate_cents !== null ? (entry.hourly_rate_cents / 100).toFixed(2) : "");
    setEditStartedAt(toLocalInputValue(new Date(entry.started_at)));
    setEditEndedAt(entry.ended_at ? toLocalInputValue(new Date(entry.ended_at)) : "");
  };

  const handleSaveEdit = () => {
    if (!editingEntry) return;

    const startDate = new Date(editStartedAt);
    const endDate = new Date(editEndedAt);
    if (!(endDate.getTime() > startDate.getTime())) {
      toast.error("End time must be after the start time");
      return;
    }

    let hourlyRateCents: number | null = null;
    if (editRate.trim()) {
      const parsed = Math.round(Number.parseFloat(editRate) * 100);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Enter a valid hourly rate");
        return;
      }
      hourlyRateCents = parsed;
    }

    startTransition(async () => {
      const result = await updateTimeEntryAction(agencyId, projectId, editingEntry.id, {
        description: editDescription.trim() || null,
        taskId: editTaskId || null,
        isBillable: editIsBillable,
        hourlyRateCents,
        startedAt: startDate.toISOString(),
        endedAt: endDate.toISOString(),
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Time entry updated");
      setEditingEntry(null);
    });
  };

  const handleDelete = () => {
    if (!deletingEntry) return;

    startTransition(async () => {
      const result = await deleteTimeEntryAction(agencyId, projectId, deletingEntry.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Time entry deleted");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(deletingEntry.id);
        return next;
      });
      setDeletingEntry(null);
    });
  };

  const handleGenerateInvoice = () => {
    if (selected.size === 0) return;
    setError(null);

    startTransition(async () => {
      const result = await createInvoiceFromTimeEntriesAction(agencyId, clientId, projectId, Array.from(selected));
      // On success this redirects and never resolves normally — an `error`
      // only comes back when creation failed.
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
      }
    });
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <span className={styles.selectedCount}>
          {selected.size > 0 ? `${selected.size} selected` : "Select uninvoiced, billable entries to bill"}
        </span>
        <button
          type="button"
          className={styles.generate}
          onClick={handleGenerateInvoice}
          disabled={isPending || selected.size === 0}
        >
          {isPending ? "Generating…" : "Generate invoice from selected"}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No time logged yet</p>
          <p className={styles.emptyText}>Start a timer or log a manual entry above to see it here.</p>
        </div>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.headCell}>
                  <input
                    type="checkbox"
                    aria-label="Select all eligible entries"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableIds.length === 0}
                  />
                </th>
                <th className={styles.headCell}>Date</th>
                <th className={styles.headCell}>User</th>
                <th className={styles.headCell}>Task</th>
                <th className={styles.headCell}>Description</th>
                <th className={styles.headCell}>Duration</th>
                <th className={styles.headCell}>Billable</th>
                <th className={styles.headCell}>Rate</th>
                <th className={styles.headCell}>Amount</th>
                <th className={styles.headCell}>Invoiced</th>
                <th className={styles.headCell}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const canEdit = !entry.invoiced && entry.ended_at !== null;
                const canDelete = !entry.invoiced;
                const selectable = isSelectable(entry);

                return (
                  <tr key={entry.id} className={styles.row}>
                    <td className={styles.cell}>
                      <input
                        type="checkbox"
                        aria-label={`Select entry from ${formatDate(entry.started_at)}`}
                        checked={selected.has(entry.id)}
                        onChange={() => toggleOne(entry.id)}
                        disabled={!selectable}
                      />
                    </td>
                    <td className={`${styles.cell} ${styles.nowrap}`}>{formatDate(entry.started_at)}</td>
                    <td className={styles.cell}>{entry.user_name}</td>
                    <td className={styles.cell}>{entry.task_title ?? <span className={styles.muted}>—</span>}</td>
                    <td className={styles.cell}>{entry.description ?? <span className={styles.muted}>—</span>}</td>
                    <td className={`${styles.cell} ${styles.nowrap}`}>
                      {entry.ended_at === null ? (
                        <span className={styles.runningBadge}>Running…</span>
                      ) : (
                        formatDuration(entry.duration_minutes)
                      )}
                    </td>
                    <td className={styles.cell}>{entry.is_billable ? "Yes" : "No"}</td>
                    <td className={`${styles.cell} ${styles.nowrap}`}>
                      {entry.hourly_rate_cents !== null ? (
                        `${formatMoneyCents(entry.hourly_rate_cents)}/hr`
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={`${styles.cell} ${styles.nowrap}`}>
                      {entry.amount_cents !== null ? (
                        formatMoneyCents(entry.amount_cents)
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={styles.cell}>
                      {entry.invoiced ? (
                        <span className={styles.invoicedBadge}>Invoiced</span>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={styles.cell}>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => openEdit(entry)}
                          disabled={!canEdit}
                          aria-label={`Edit entry from ${formatDate(entry.started_at)}`}
                          title={!canEdit ? (entry.invoiced ? "Invoiced entries can't be edited" : "Stop the timer to edit it") : undefined}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => setDeletingEntry(entry)}
                          disabled={!canDelete}
                          aria-label={`Delete entry from ${formatDate(entry.started_at)}`}
                          title={!canDelete ? "Invoiced entries can't be deleted" : undefined}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Dialog.Root open={editingEntry !== null} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Edit time entry">
            <Dialog.Title className={styles.dialogTitle}>Edit time entry</Dialog.Title>
            <div className={styles.dialogForm}>
              <label className={styles.field}>
                <span className={styles.label}>Task</span>
                <select
                  className={styles.select}
                  value={editTaskId}
                  onChange={(event) => setEditTaskId(event.target.value)}
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
                <span className={styles.label}>Description</span>
                <input
                  className={styles.input}
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                />
              </label>
              <div className={styles.dialogRow}>
                <label className={styles.field}>
                  <span className={styles.label}>Start</span>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={editStartedAt}
                    onChange={(event) => setEditStartedAt(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>End</span>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={editEndedAt}
                    onChange={(event) => setEditEndedAt(event.target.value)}
                  />
                </label>
              </div>
              <div className={styles.dialogRow}>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={editIsBillable}
                    onChange={(event) => setEditIsBillable(event.target.checked)}
                  />
                  Billable
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Hourly rate</span>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.input}
                    value={editRate}
                    onChange={(event) => setEditRate(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setEditingEntry(null)}>
                Cancel
              </button>
              <button type="button" className={styles.primary} onClick={handleSaveEdit} disabled={isPending}>
                {isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={deletingEntry !== null} onOpenChange={(open) => !open && setDeletingEntry(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} aria-label="Delete time entry">
            <Dialog.Title className={styles.dialogTitle}>Delete this time entry?</Dialog.Title>
            <Dialog.Description className={styles.dialogDescription}>
              This can&apos;t be undone.
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.ghost} onClick={() => setDeletingEntry(null)}>
                Cancel
              </button>
              <button type="button" className={styles.dangerSolid} onClick={handleDelete} disabled={isPending}>
                {isPending ? "Deleting…" : "Delete entry"}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default TimeEntriesTable;

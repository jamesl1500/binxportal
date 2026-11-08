/**
 * TodoCard.tsx
 *
 * Milanote's to-do list card, wired to real project tasks: each row is a
 * ProjectTask (it also shows on the Kanban, My work and the dashboard).
 * Ticking a row moves the task to the project's last Kanban list; moving it
 * there on the Kanban ticks it here, live. The agency team adds, renames,
 * assigns, dates and removes rows; the client sees the list read-only (no
 * assignees — the portal never shows who internally owns a task).
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/cards/TodoCard.tsx
 * @author Binx Portal
 */
"use client";

import { useMemo, useState } from "react";
import { Check, Link2, MoreHorizontal, Plus } from "lucide-react";

import {
  cardTitle,
  type BoardItem,
  type BoardTask,
  type BoardTaskPatch,
} from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";
import {
  useBoardCanvas,
  type TodoOptions,
} from "@/components/boards/BoardCanvas/BoardCanvasContext";

import EditableTitle from "./EditableTitle";
import styles from "./BoardCards.module.scss";

interface TodoCardProps {
  item: BoardItem;
  autoEdit: boolean;
  onSaveTitle: (title: string) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDue(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isOverdue(iso: string): boolean {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return iso < key;
}

const TodoCard = ({ item, autoEdit, onSaveTitle }: TodoCardProps) => {
  const { actions, viewerKind, onError } = useBoardCanvas();
  const tasksById = useBoardStore((s) => s.tasksById);
  const upsertTask = useBoardStore((s) => s.upsertTask);
  const patchTask = useBoardStore((s) => s.patchTask);
  const removeTask = useBoardStore((s) => s.removeTask);

  const tasks = useMemo(
    () =>
      Object.values(tasksById)
        .filter((t) => t.item_id === item.id)
        .sort((a, b) => a.position - b.position),
    [tasksById, item.id],
  );
  const done = tasks.filter((t) => t.done).length;
  const canEdit = viewerKind === "agency" && Boolean(actions.updateTask);

  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [picker, setPicker] = useState<"attach" | null>(null);
  const [options, setOptions] = useState<TodoOptions | null>(null);

  const loadOptions = async () => {
    if (options || !actions.todoOptions) return;
    const result = await actions.todoOptions();
    if (result.error) onError(result.error);
    setOptions(result);
  };

  const update = (task: BoardTask, patch: BoardTaskPatch, optimistic: Partial<BoardTask>) => {
    if (!actions.updateTask) return;
    const snapshot = task;
    patchTask(task.id, optimistic);
    void actions.updateTask(item.id, task.id, patch).then((r) => {
      if (r.error || !r.task) {
        upsertTask(snapshot);
        onError(r.error ?? "Unable to update the task");
        return;
      }
      upsertTask(r.task);
    });
  };

  const addRow = async () => {
    const title = draft.trim();
    if (!title || !actions.addTask) return;
    setAdding(true);
    const r = await actions.addTask(item.id, title);
    setAdding(false);
    if (r.error || !r.task) return onError(r.error ?? "Unable to add the task");
    upsertTask(r.task);
    setDraft("");
  };

  const remove = (task: BoardTask, deleteTask: boolean) => {
    if (!actions.removeTask) return;
    setMenuId(null);
    removeTask(task.id);
    void actions.removeTask(item.id, task.id, deleteTask).then((r) => {
      if (r.error) {
        upsertTask(task);
        onError(r.error);
      }
    });
  };

  const attach = async (taskId: string) => {
    if (!actions.attachTask) return;
    setPicker(null);
    const r = await actions.attachTask(item.id, taskId);
    if (r.error || !r.task) return onError(r.error ?? "Unable to add that task");
    upsertTask(r.task);
  };

  const onCard = new Set(tasks.map((t) => t.id));
  const attachable = (options?.tasks ?? []).filter((t) => !onCard.has(t.id));

  return (
    <div className={styles.todo}>
      <header className={styles.todoHeader}>
        <EditableTitle
          value={cardTitle(item)}
          placeholder="To-do list"
          canEdit={canEdit}
          autoEdit={autoEdit}
          maxLength={200}
          onSave={onSaveTitle}
        />
        {tasks.length > 0 && (
          <span className={styles.todoCount} aria-label={`${done} of ${tasks.length} done`}>
            {done}/{tasks.length}
          </span>
        )}
      </header>
      {tasks.length > 0 && (
        <div className={styles.todoProgress} aria-hidden="true">
          <span style={{ width: `${(done / tasks.length) * 100}%` }} />
        </div>
      )}

      <ul className={styles.todoList}>
        {tasks.map((task) => (
          <li key={task.id} className={styles.todoRow} data-done={task.done}>
            <button
              type="button"
              role="checkbox"
              aria-checked={task.done}
              aria-label={task.done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
              className={styles.todoCheck}
              disabled={!canEdit}
              onClick={() => update(task, { done: !task.done }, { done: !task.done })}
            >
              {task.done && <Check aria-hidden="true" />}
            </button>

            {renamingId === task.id ? (
              <input
                className={styles.todoInput}
                defaultValue={task.title}
                autoFocus
                aria-label="Task title"
                onBlur={(e) => {
                  setRenamingId(null);
                  const next = e.target.value.trim();
                  if (next && next !== task.title) update(task, { title: next }, { title: next });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            ) : (
              <span
                className={styles.todoTitle}
                onDoubleClick={(e) => {
                  if (!canEdit) return;
                  e.stopPropagation();
                  setRenamingId(task.id);
                }}
              >
                {task.title}
              </span>
            )}

            <span className={styles.todoChips}>
              {task.due_date && (
                <span
                  className={styles.todoDue}
                  data-overdue={!task.done && isOverdue(task.due_date)}
                >
                  {formatDue(task.due_date)}
                </span>
              )}
              {task.assignee_name && (
                <span className={styles.todoAvatar} title={task.assignee_name}>
                  {initials(task.assignee_name)}
                </span>
              )}
            </span>

            {canEdit && (
              <button
                type="button"
                className={styles.todoMore}
                aria-label={`Task options for “${task.title}”`}
                aria-expanded={menuId === task.id}
                onClick={() => {
                  setMenuId(menuId === task.id ? null : task.id);
                  void loadOptions();
                }}
              >
                <MoreHorizontal aria-hidden="true" />
              </button>
            )}

            {menuId === task.id && (
              <div className={styles.todoMenu} data-no-drag role="menu">
                <label className={styles.todoMenuField}>
                  Due
                  <input
                    type="date"
                    value={task.due_date ?? ""}
                    onChange={(e) =>
                      update(
                        task,
                        e.target.value ? { due_date: e.target.value } : { clear_due_date: true },
                        { due_date: e.target.value || null },
                      )
                    }
                  />
                </label>
                <label className={styles.todoMenuField}>
                  Assignee
                  <select
                    value={task.assignee_id ?? ""}
                    onChange={(e) => {
                      const member = options?.members?.find((m) => m.user_id === e.target.value);
                      update(
                        task,
                        e.target.value ? { assignee_id: e.target.value } : { clear_assignee: true },
                        {
                          assignee_id: e.target.value || null,
                          assignee_name: member?.full_name ?? null,
                        },
                      );
                    }}
                  >
                    <option value="">Unassigned</option>
                    {(options?.members ?? []).map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" role="menuitem" onClick={() => setRenamingId(task.id)}>
                  Rename
                </button>
                <button type="button" role="menuitem" onClick={() => remove(task, false)}>
                  Remove from list
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-tone="danger"
                  onClick={() => remove(task, true)}
                >
                  Delete task
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {tasks.length === 0 && !canEdit && <p className={styles.todoEmpty}>No tasks yet.</p>}

      {canEdit && (
        <div className={styles.todoAdd}>
          <Plus aria-hidden="true" />
          <input
            className={styles.todoInput}
            value={draft}
            placeholder="Add a task…"
            aria-label="Add a task"
            disabled={adding}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addRow();
            }}
          />
          {actions.attachTask && (
            <button
              type="button"
              className={styles.todoLinkExisting}
              aria-label="Add an existing task"
              title="Add an existing task"
              onClick={() => {
                setPicker(picker ? null : "attach");
                void loadOptions();
              }}
            >
              <Link2 aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {picker === "attach" && (
        <div className={styles.todoPicker} data-no-drag>
          {!options ? (
            <p className={styles.todoEmpty}>Loading tasks…</p>
          ) : attachable.length === 0 ? (
            <p className={styles.todoEmpty}>Every task is already on this list.</p>
          ) : (
            <ul>
              {attachable.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => void attach(t.id)}>
                    <span>{t.title}</span>
                    <small>{t.list_name}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default TodoCard;

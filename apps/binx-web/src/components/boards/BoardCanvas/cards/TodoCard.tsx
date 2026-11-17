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

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Link2, MoreHorizontal, Plus } from "lucide-react";

import { useTouchRowGestures } from "@/hooks/useTouchRowGestures";

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

interface TodoRowProps {
  taskId: string;
  done: boolean;
  /** Touch gestures only apply when the viewer can edit. */
  enabled: boolean;
  onTap: () => void;
  onLongPress: () => void;
  children: (isTouchInput: () => boolean) => React.ReactNode;
}

/**
 * One row. On touch/pen the whole row is the target: a tap ticks the task
 * (the 16px checkbox alone is too small for a fingertip, at any zoom), and a
 * long press opens the row's options in place of the hover-only "⋯" button.
 * Mouse input keeps the checkbox, "⋯" and double-click-to-rename.
 */
const TodoRow = ({ taskId, done, enabled, onTap, onLongPress, children }: TodoRowProps) => {
  const { handlers, isTouchInput } = useTouchRowGestures({ enabled, onTap, onLongPress });
  return (
    <li className={styles.todoRow} data-done={done} data-todo-row={taskId} {...handlers}>
      {children(isTouchInput)}
    </li>
  );
};

/** How long after the finger lifts its synthesized `click` may still arrive.
 * Modern mobile browsers (width=device-width, no double-tap zoom) fire it
 * immediately; this only bounds how long the guard stays armed. */
export const LIFT_CLICK_WINDOW_MS = 300;

interface TodoSheetProps {
  task: BoardTask;
  /** Opened by a long press, i.e. while the finger is still down on screen. */
  openedByPress: boolean;
  onClose: () => void;
  onRename: (title: string) => void;
  /** The same Due / Assignee / Remove / Delete controls as the anchored menu. */
  children: React.ReactNode;
}

/**
 * The row menu as a bottom sheet, for touch. Portaled to <body> so it sits
 * outside the canvas's zoom transform — full-size controls at any zoom — and
 * a tap on the dimmed backdrop closes it. React events still bubble through a
 * portal to the row and card, so the root stops them: a press in the sheet
 * must never tick the task, select or drag the card.
 */
const TodoSheet = ({ task, openedByPress, onClose, onRename, children }: TodoSheetProps) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  // A long press opens the sheet while the finger is still on the glass. When
  // it lifts, the browser fires `click` at whatever is under it NOW — which
  // can be one of the sheet's own buttons ("Delete task"). Swallow that one
  // click, in the capture phase before any handler sees it. A lift produces
  // at most one click, so the guard disarms after it (or shortly after the
  // lift if none comes) and a deliberate next tap always goes through.
  useEffect(() => {
    if (!openedByPress) return;
    let liftTimer: ReturnType<typeof setTimeout> | undefined;
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      done();
    };
    const done = () => {
      window.removeEventListener("click", swallow, true);
      window.removeEventListener("pointerup", lifted, true);
      window.removeEventListener("pointercancel", lifted, true);
    };
    const lifted = () => {
      clearTimeout(liftTimer);
      liftTimer = setTimeout(done, LIFT_CLICK_WINDOW_MS);
    };
    window.addEventListener("click", swallow, true);
    window.addEventListener("pointerup", lifted, true);
    window.addEventListener("pointercancel", lifted, true);
    return () => {
      clearTimeout(liftTimer);
      done();
    };
  }, [openedByPress]);

  // The sheet opens while the finger is still down (long press), so the
  // `click` the browser fires on lifting it lands on this freshly-mounted
  // backdrop. Only a press that STARTED on the backdrop may close the sheet.
  const pressedBackdrop = useRef(false);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className={styles.todoSheetBackdrop}
      data-no-drag
      data-todo-menu={task.id}
      onPointerDown={(e) => {
        e.stopPropagation();
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onDoubleClick={stop}
      onContextMenu={stop}
      onClick={(e) => {
        e.stopPropagation();
        const fromBackdrop = pressedBackdrop.current && e.target === e.currentTarget;
        pressedBackdrop.current = false;
        if (fromBackdrop) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={styles.todoSheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Task options for “${task.title}”`}
        tabIndex={-1}
      >
        <span className={styles.todoSheetHandle} aria-hidden="true" />
        <label className={styles.todoMenuField}>
          Title
          <input
            type="text"
            defaultValue={task.title}
            maxLength={200}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== task.title) onRename(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
        <div role="menu" className={styles.todoSheetMenu}>
          {children}
        </div>
        <button type="button" className={styles.todoSheetDone} onClick={onClose}>
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
};

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
  // Touch gets the menu as a bottom sheet: inside the zoomed canvas the
  // anchored menu is a few px tall on a phone, and touch adjustment snaps
  // taps near the row onto its tiny controls.
  const [menuAsSheet, setMenuAsSheet] = useState(false);
  const [sheetFromPress, setSheetFromPress] = useState(false);
  const [picker, setPicker] = useState<"attach" | null>(null);
  const [options, setOptions] = useState<TodoOptions | null>(null);

  // Close an open row menu on a press anywhere outside that row, or Escape.
  // Needed now that touch opens it by long press (no "⋯" to tap again).
  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return setMenuId(null);
      const inside =
        e.target.closest(`[data-todo-row="${menuId}"]`) ?? e.target.closest(`[data-todo-menu="${menuId}"]`);
      if (!inside) setMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuId(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

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
          <TodoRow
            key={task.id}
            taskId={task.id}
            done={task.done}
            enabled={canEdit}
            onTap={() => {
              // With the row's menu open, a tap on the row dismisses it.
              if (menuId === task.id) return setMenuId(null);
              update(task, { done: !task.done }, { done: !task.done });
            }}
            onLongPress={() => {
              navigator.vibrate?.(10);
              setMenuAsSheet(true);
              setSheetFromPress(true);
              setMenuId(task.id);
              void loadOptions();
            }}
          >
            {(isTouchInput) => (
              <>
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
                      // On touch a double tap is two row taps; rename lives in
                      // the long-press menu there.
                      if (!canEdit || isTouchInput()) return;
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
                      // A screen reader on a phone activates this (it is only
                      // visually hidden there): give it the sheet too.
                      setMenuAsSheet(window.matchMedia?.("(pointer: coarse)").matches ?? false);
                      setSheetFromPress(false);
                      setMenuId(menuId === task.id ? null : task.id);
                      void loadOptions();
                    }}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </button>
                )}

                {menuId === task.id && !menuAsSheet && (
                  <div className={styles.todoMenu} data-no-drag role="menu" data-todo-menu={task.id}>
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
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuId(null);
                        setRenamingId(task.id);
                      }}
                    >
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
                {menuId === task.id && menuAsSheet && (
                  <TodoSheet
                    task={task}
                    openedByPress={sheetFromPress}
                    onClose={() => setMenuId(null)}
                    onRename={(title) => update(task, { title }, { title })}
                  >
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
                  </TodoSheet>
                )}
              </>
            )}
          </TodoRow>
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

/**
 * KanbanBoard.tsx
 *
 * A project's task board: columns (lists) of cards (tasks). A card is moved
 * to another column by dragging it there (native HTML5 drag-and-drop — no DnD
 * library for one board) or from the List field in its detail panel; there's
 * deliberately no per-card "move" control cluttering the face. Clicking a
 * card's title opens TaskDetailPanel, a right-side drawer for managing that
 * task in full (fields, tags, files, comments) without leaving the board.
 * Every mutation (add/rename/delete list, add/move/delete task, and anything
 * done inside the panel) calls its server action, then `router.refresh()` to
 * re-fetch the board from the parent Server Component — no optimistic local
 * state, same "mutate then refetch" pattern as the rest of the app.
 *
 * @module apps/binx-web/src/components/forms/projects/KanbanBoard/KanbanBoard.tsx
 * @author Binx.io
 */
"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Paperclip, Plus, X } from "lucide-react";

import {
  createTaskAction,
  createTaskListAction,
  deleteTaskListAction,
  moveTaskAction,
  renameTaskListAction,
} from "@/app/(app)/projects/[projectId]/actions";
import type { BoardColumn, ProjectMember, ProjectTag, Task } from "@/lib/projects";
import TaskDetailPanel from "@/components/forms/projects/TaskDetailPanel/TaskDetailPanel";

import styles from "./KanbanBoard.module.scss";

interface KanbanBoardProps {
  agencyId: string;
  projectId: string;
  columns: BoardColumn[];
  projectMembers: ProjectMember[];
  /** Tags configured for this project — passed through to the task panel's tag picker. */
  projectTags: ProjectTag[];
  currentUserId: string;
  canModerateComments: boolean;
}

function formatDueDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const KanbanBoard = ({
  agencyId,
  projectId,
  columns,
  projectMembers,
  projectTags,
  currentUserId,
  canModerateComments,
}: KanbanBoardProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [addingListOpen, setAddingListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [addingTaskListId, setAddingTaskListId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  // Two states, not one: selectedTaskId is which task's data to show (kept
  // through the close transition so the panel's content doesn't vanish
  // before the animation finishes); panelOpen drives the visible open/close
  // state. See TaskDetailPanel's onClosed, which clears selectedTaskId once
  // the transition actually completes.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Native drag-and-drop: which card is in flight, and which column it's
  // hovering over (for the drop-target highlight).
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverListId, setDragOverListId] = useState<string | null>(null);

  const run = (action: () => Promise<{ error?: string }>, onSuccess?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  };

  const handleAddList = (event: FormEvent) => {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    run(() => createTaskListAction(agencyId, projectId, name), () => {
      setNewListName("");
      setAddingListOpen(false);
    });
  };

  const handleRenameList = (listId: string) => {
    const name = renameDraft.trim();
    if (!name) return;
    run(() => renameTaskListAction(agencyId, projectId, listId, name), () => setRenamingListId(null));
  };

  const handleDeleteList = (listId: string) => {
    run(() => deleteTaskListAction(agencyId, projectId, listId));
  };

  const handleAddTask = (event: FormEvent, listId: string) => {
    event.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    run(
      () => createTaskAction(agencyId, projectId, { listId, title, description: null, dueDate: null, assigneeId: null }),
      () => {
        setNewTaskTitle("");
        setAddingTaskListId(null);
      },
    );
  };

  const handleMoveTask = (task: Task, listId: string) => {
    if (listId === task.list_id) return;
    const destination = columns.find((column) => column.id === listId);
    const position = destination ? destination.tasks.length : 0;
    run(() => moveTaskAction(agencyId, projectId, task.id, listId, position));
  };

  const handleDropOnList = (listId: string) => {
    const taskId = draggedTaskId;
    setDraggedTaskId(null);
    setDragOverListId(null);
    if (!taskId) return;
    const task = columns.flatMap((column) => column.tasks).find((candidate) => candidate.id === taskId);
    if (task) handleMoveTask(task, listId);
  };

  const selectedTask = selectedTaskId
    ? columns.flatMap((column) => column.tasks).find((task) => task.id === selectedTaskId) ?? null
    : null;

  return (
    <div className={styles.wrapper}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.board}>
        {columns.map((column) => (
          <div
            key={column.id}
            className={styles.column}
            data-dragover={draggedTaskId !== null && dragOverListId === column.id}
            onDragOver={(event) => {
              if (draggedTaskId === null) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOverListId(column.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDropOnList(column.id);
            }}
          >
            <div className={styles.columnHeader}>
              {renamingListId === column.id ? (
                <input
                  autoFocus
                  className={styles.renameInput}
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onBlur={() => handleRenameList(column.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleRenameList(column.id);
                    if (event.key === "Escape") setRenamingListId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.columnName}
                  onClick={() => {
                    setRenamingListId(column.id);
                    setRenameDraft(column.name);
                  }}
                >
                  {column.name}
                </button>
              )}
              <span className={styles.columnCount}>{column.tasks.length}</span>
              <button
                type="button"
                className={styles.columnDelete}
                onClick={() => handleDeleteList(column.id)}
                disabled={isPending || column.tasks.length > 0 || columns.length <= 1}
                title={
                  column.tasks.length > 0
                    ? "Move or delete this list's tasks first"
                    : columns.length <= 1
                      ? "A project needs at least one list"
                      : "Delete list"
                }
                aria-label={`Delete ${column.name}`}
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className={styles.cards}>
              {column.tasks.map((task) => (
                <div
                  key={task.id}
                  className={styles.card}
                  draggable={!isPending}
                  data-dragging={draggedTaskId === task.id}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", task.id);
                    setDraggedTaskId(task.id);
                  }}
                  onDragEnd={() => {
                    setDraggedTaskId(null);
                    setDragOverListId(null);
                  }}
                >
                  <button
                    type="button"
                    className={styles.cardTitle}
                    onClick={() => {
                      setSelectedTaskId(task.id);
                      setPanelOpen(true);
                    }}
                  >
                    {task.title}
                  </button>
                  {task.description && <p className={styles.cardDescription}>{task.description}</p>}
                  {task.tags.length > 0 && (
                    <div className={styles.cardTags}>
                      {task.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className={styles.cardTag}
                          style={{ borderColor: tag.color, color: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={styles.cardMeta}>
                    {task.due_date && <span className={styles.cardDue}>{formatDueDate(task.due_date)}</span>}
                    {task.assignee_name && <span className={styles.cardAssignee}>{task.assignee_name}</span>}
                    {task.comment_count > 0 && (
                      <span className={styles.cardBadge}>
                        <MessageSquare aria-hidden="true" /> {task.comment_count}
                      </span>
                    )}
                    {task.file_count > 0 && (
                      <span className={styles.cardBadge}>
                        <Paperclip aria-hidden="true" /> {task.file_count}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {addingTaskListId === column.id ? (
              <form className={styles.addTaskForm} onSubmit={(event) => handleAddTask(event, column.id)}>
                <input
                  autoFocus
                  type="text"
                  className={styles.addTaskInput}
                  placeholder="Task title"
                  value={newTaskTitle}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setAddingTaskListId(null);
                      setNewTaskTitle("");
                    }
                  }}
                />
                <div className={styles.addTaskActions}>
                  <button type="submit" className={styles.addTaskSubmit} disabled={isPending || !newTaskTitle.trim()}>
                    Add
                  </button>
                  <button
                    type="button"
                    className={styles.addTaskCancel}
                    onClick={() => {
                      setAddingTaskListId(null);
                      setNewTaskTitle("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className={styles.addTaskTrigger}
                onClick={() => {
                  setAddingTaskListId(column.id);
                  setNewTaskTitle("");
                }}
              >
                <Plus aria-hidden="true" /> Add task
              </button>
            )}
          </div>
        ))}

        <div className={styles.addListColumn}>
          {addingListOpen ? (
            <form className={styles.addListForm} onSubmit={handleAddList}>
              <input
                autoFocus
                type="text"
                className={styles.addTaskInput}
                placeholder="List name"
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setAddingListOpen(false);
                    setNewListName("");
                  }
                }}
              />
              <div className={styles.addTaskActions}>
                <button type="submit" className={styles.addTaskSubmit} disabled={isPending || !newListName.trim()}>
                  Add list
                </button>
                <button
                  type="button"
                  className={styles.addTaskCancel}
                  onClick={() => {
                    setAddingListOpen(false);
                    setNewListName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={styles.addListTrigger} onClick={() => setAddingListOpen(true)}>
              <Plus aria-hidden="true" /> Add list
            </button>
          )}
        </div>
      </div>

      <TaskDetailPanel
        agencyId={agencyId}
        projectId={projectId}
        task={selectedTask}
        open={panelOpen}
        columns={columns}
        projectMembers={projectMembers}
        projectTags={projectTags}
        currentUserId={currentUserId}
        canModerateComments={canModerateComments}
        onOpenChange={setPanelOpen}
        onClosed={() => setSelectedTaskId(null)}
        onMutated={() => router.refresh()}
      />
    </div>
  );
};

export default KanbanBoard;

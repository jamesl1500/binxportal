/**
 * TaskDetailPanel.tsx
 *
 * Right-side, full-height drawer for managing one task in detail. It has two
 * parts:
 *
 *   1. Details — the task's fields (title/description/list/due date/assignee)
 *      and its tags. Read-only by default; "Edit details" swaps in the form,
 *      "Save changes"/"Cancel" swaps back. Tag toggles apply immediately
 *      (like the board's move control), so Cancel doesn't undo them.
 *   2. A tabbed area below it for the task's Comments and Files, Comments
 *      first and shown by default.
 *
 * Opened by clicking a card's title in KanbanBoard. Comments are shown as
 * coming from an agency member today — binx-api has no client-facing portal
 * yet, but TaskComment.author_type is already shaped for a future
 * client-authored comment (see AUTHOR_CLIENT in binx-api's
 * projects/models.py), so this panel already renders whichever author_type
 * comes back rather than assuming "agency_member".
 *
 * @module apps/binx-web/src/components/forms/projects/TaskDetailPanel/TaskDetailPanel.tsx
 * @author Binx.io
 */
"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Paperclip, Pencil, Trash2, X } from "lucide-react";

import {
  addTaskCommentAction,
  deleteTaskAction,
  deleteTaskCommentAction,
  deleteTaskFileAction,
  getTaskCommentsAction,
  getTaskFilesAction,
  setTaskTagsAction,
  updateTaskAction,
  uploadTaskFileAction,
} from "@/app/(app)/projects/[projectId]/actions";
import { getTaskFileDownloadUrl } from "@/lib/projects-client";
import type { BoardColumn, ProjectMember, ProjectTag, Task, TaskComment, TaskFile } from "@/lib/projects";

import styles from "./TaskDetailPanel.module.scss";

// Keep in sync with binx-api's ALLOWED_TASK_FILE_MIME_TYPES (projects/service.py).
const ACCEPTED_FILE_TYPES =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type DetailTab = "comments" | "files";

interface TaskDetailPanelProps {
  agencyId: string;
  projectId: string;
  task: Task | null;
  /** Whether the panel should be visually open. `task` stays non-null through the close transition so its content doesn't vanish before the animation finishes. */
  open: boolean;
  columns: BoardColumn[];
  projectMembers: ProjectMember[];
  /** Every tag configured for this project (Settings → Task tags) — the options in the picker. */
  projectTags: ProjectTag[];
  currentUserId: string;
  canModerateComments: boolean;
  /** Fired as the panel starts opening/closing (drives the `open` prop above). */
  onOpenChange: (open: boolean) => void;
  /** Fired once the close transition has actually finished — the right time for the parent to forget which task was selected. */
  onClosed: () => void;
  /** Called after any successful mutation so the board (counts, title, list) can re-fetch. */
  onMutated: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDueDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const TaskDetailPanel = ({
  agencyId,
  projectId,
  task,
  open,
  columns,
  projectMembers,
  projectTags,
  currentUserId,
  canModerateComments,
  onOpenChange,
  onClosed,
  onMutated,
}: TaskDetailPanelProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("comments");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [listId, setListId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isTagging, startTagging] = useTransition();

  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const [isPostingComment, startPostingComment] = useTransition();

  const [files, setFiles] = useState<TaskFile[] | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [isUploading, startUploading] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reseed every field the instant a different task is opened (or this one
  // is opened for the first time) — done during render, per React's
  // "adjusting state when a prop changes" pattern, rather than in an effect:
  // an effect body calling setState synchronously just causes an extra
  // committed render, where this bails out before ever painting the stale
  // fields. See https://react.dev/learn/you-might-not-need-an-effect. Starts
  // `undefined` so the first render with a non-null task always seeds, even
  // when the panel is mounted with one already selected.
  const [seededTaskId, setSeededTaskId] = useState<string | undefined>(undefined);
  if (task && task.id !== seededTaskId) {
    setSeededTaskId(task.id);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setDueDate(task.due_date ?? "");
    setAssigneeId(task.assignee_id ?? "");
    setListId(task.list_id);
    setTagIds(task.tags.map((tag) => tag.id));
    setFormError(null);
    setIsEditing(false);
    setActiveTab("comments");
    setComments(null);
    setCommentsError(null);
    setNewComment("");
    setCommentFile(null);
    setFiles(null);
    setFilesError(null);
  }

  // The actual side effect: fetching comments/files from binx-api whenever
  // the seeded task changes.
  useEffect(() => {
    if (!task) return;

    startPostingComment(async () => {
      const result = await getTaskCommentsAction(agencyId, projectId, task.id);
      if (result.error) setCommentsError(result.error);
      else setComments(result.comments ?? []);
    });

    startUploading(async () => {
      const result = await getTaskFilesAction(agencyId, projectId, task.id);
      if (result.error) setFilesError(result.error);
      else setFiles(result.files ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  if (!task) return null;

  const currentTask = task;
  const listName = columns.find((column) => column.id === currentTask.list_id)?.name ?? "—";
  const commentCount = comments?.length ?? currentTask.comment_count;
  const fileCount = files?.length ?? currentTask.file_count;

  const resetFields = () => {
    setTitle(currentTask.title);
    setDescription(currentTask.description ?? "");
    setDueDate(currentTask.due_date ?? "");
    setAssigneeId(currentTask.assignee_id ?? "");
    setListId(currentTask.list_id);
    setFormError(null);
  };

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setFormError(null);
    startSaving(async () => {
      const result = await updateTaskAction(agencyId, projectId, currentTask.id, {
        listId,
        title: trimmedTitle,
        description: description.trim() || null,
        dueDate: dueDate || null,
        assigneeId: assigneeId || null,
      });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setIsEditing(false);
      onMutated();
    });
  };

  const handleToggleTag = (tagId: string) => {
    const next = tagIds.includes(tagId) ? tagIds.filter((id) => id !== tagId) : [...tagIds, tagId];
    const previous = tagIds;
    setTagIds(next);
    setFormError(null);
    startTagging(async () => {
      const result = await setTaskTagsAction(agencyId, projectId, currentTask.id, next);
      if (result.error) {
        setTagIds(previous);
        setFormError(result.error);
        return;
      }
      onMutated();
    });
  };

  const handleDeleteTask = () => {
    startDeleting(async () => {
      const result = await deleteTaskAction(agencyId, projectId, currentTask.id);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      onMutated();
      onOpenChange(false);
    });
  };

  const handlePostComment = (event: FormEvent) => {
    event.preventDefault();
    const body = newComment.trim();
    if (!body) return;

    setCommentsError(null);
    const file = commentFile;
    startPostingComment(async () => {
      const result = await addTaskCommentAction(agencyId, projectId, currentTask.id, body, file);
      if (result.error) {
        setCommentsError(result.error);
        return;
      }
      setComments((prev) => [...(prev ?? []), result.comment!]);
      // A comment's file is a real task file — keep the Files tab in step
      // without a refetch (the board's count is refreshed by onMutated).
      const attached = result.comment?.attachment;
      if (attached) {
        setFiles((prev) => (prev ? [attached, ...prev] : prev));
      }
      setNewComment("");
      setCommentFile(null);
      if (commentFileRef.current) commentFileRef.current.value = "";
      onMutated();
    });
  };

  const handleDeleteComment = (commentId: string) => {
    setCommentsError(null);
    startPostingComment(async () => {
      const result = await deleteTaskCommentAction(agencyId, projectId, currentTask.id, commentId);
      if (result.error) {
        setCommentsError(result.error);
        return;
      }
      const removed = comments?.find((comment) => comment.id === commentId);
      setComments((prev) => (prev ?? []).filter((comment) => comment.id !== commentId));
      // Deleting a comment also deletes the file it carried.
      if (removed?.attachment) {
        setFiles((prev) => (prev ? prev.filter((file) => file.id !== removed.attachment!.id) : prev));
      }
      onMutated();
    });
  };

  const handleUploadFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFilesError(null);
    startUploading(async () => {
      const result = await uploadTaskFileAction(agencyId, projectId, currentTask.id, file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (result.error) {
        setFilesError(result.error);
        return;
      }
      setFiles((prev) => [result.file!, ...(prev ?? [])]);
      onMutated();
    });
  };

  const handleDeleteFile = (fileId: string) => {
    setFilesError(null);
    startUploading(async () => {
      const result = await deleteTaskFileAction(agencyId, projectId, currentTask.id, fileId);
      if (result.error) {
        setFilesError(result.error);
        return;
      }
      setFiles((prev) => (prev ?? []).filter((file) => file.id !== fileId));
      onMutated();
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(isOpen) => !isOpen && onClosed()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.panel} aria-label={`Task: ${currentTask.title}`}>
          <div className={styles.header}>
            <span className={styles.eyebrow}>Task</span>
            <Dialog.Close className={styles.closeButton} aria-label="Close">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>

          <section className={styles.section}>
            <div className={styles.detailsHeader}>
              <h2 className={styles.detailsHeading}>Details</h2>
              {!isEditing && (
                <button type="button" className={styles.editButton} onClick={() => setIsEditing(true)}>
                  <Pencil aria-hidden="true" /> Edit details
                </button>
              )}
            </div>

            {isEditing ? (
              <form className={styles.detailsForm} onSubmit={handleSave}>
                <input
                  className={styles.titleInput}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-label="Task title"
                  placeholder="Task title"
                />

                <textarea
                  className={styles.descriptionInput}
                  rows={3}
                  placeholder="Add a description…"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-label="Task description"
                />

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="task-list">
                      List
                    </label>
                    <select
                      id="task-list"
                      className={styles.fieldInput}
                      value={listId}
                      onChange={(event) => setListId(event.target.value)}
                    >
                      {columns.map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="task-due-date">
                      Due date
                    </label>
                    <input
                      id="task-due-date"
                      type="date"
                      className={styles.fieldInput}
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="task-assignee">
                    Assignee
                  </label>
                  <select
                    id="task-assignee"
                    className={styles.fieldInput}
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {projectMembers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Tags</span>
                  {projectTags.length === 0 ? (
                    <p className={styles.emptyText}>No tags configured. Add some in project Settings.</p>
                  ) : (
                    <div className={styles.tagPicker}>
                      {projectTags.map((tag) => {
                        const active = tagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            className={styles.tagToggle}
                            data-active={active}
                            aria-pressed={active}
                            disabled={isTagging}
                            onClick={() => handleToggleTag(tag.id)}
                            style={active ? { borderColor: tag.color, color: tag.color } : undefined}
                          >
                            <span className={styles.tagDot} style={{ background: tag.color }} aria-hidden="true" />
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {formError && (
                  <p className={styles.error} role="alert">
                    {formError}
                  </p>
                )}

                <div className={styles.formActions}>
                  <button type="submit" className={styles.saveButton} disabled={isSaving || !title.trim()}>
                    {isSaving ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={() => {
                      resetFields();
                      setIsEditing(false);
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button type="button" className={styles.deleteButton} onClick={handleDeleteTask} disabled={isDeleting}>
                    <Trash2 aria-hidden="true" /> {isDeleting ? "Deleting…" : "Delete task"}
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.readonly}>
                <h3 className={styles.readonlyTitle}>{currentTask.title}</h3>
                {currentTask.description ? (
                  <p className={styles.readonlyDescription}>{currentTask.description}</p>
                ) : (
                  <p className={styles.emptyText}>No description.</p>
                )}

                <dl className={styles.metaList}>
                  <div className={styles.metaItem}>
                    <dt className={styles.fieldLabel}>List</dt>
                    <dd className={styles.metaValue}>{listName}</dd>
                  </div>
                  <div className={styles.metaItem}>
                    <dt className={styles.fieldLabel}>Due date</dt>
                    <dd className={styles.metaValue}>
                      {currentTask.due_date ? formatDueDate(currentTask.due_date) : "Not set"}
                    </dd>
                  </div>
                  <div className={styles.metaItem}>
                    <dt className={styles.fieldLabel}>Assignee</dt>
                    <dd className={styles.metaValue}>{currentTask.assignee_name ?? "Unassigned"}</dd>
                  </div>
                  <div className={styles.metaItem}>
                    <dt className={styles.fieldLabel}>Tags</dt>
                    <dd className={styles.metaValue}>
                      {currentTask.tags.length === 0 ? (
                        <span className={styles.emptyInline}>None</span>
                      ) : (
                        <span className={styles.tagChips}>
                          {currentTask.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className={styles.tagChip}
                              style={{ borderColor: tag.color, color: tag.color }}
                            >
                              <span className={styles.tagDot} style={{ background: tag.color }} aria-hidden="true" />
                              {tag.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                {formError && (
                  <p className={styles.error} role="alert">
                    {formError}
                  </p>
                )}
              </div>
            )}
          </section>

          <div className={styles.tabArea}>
            <div className={styles.tabs} role="tablist" aria-label="Task activity">
              <button
                type="button"
                role="tab"
                id="task-tab-comments"
                aria-selected={activeTab === "comments"}
                aria-controls="task-panel-comments"
                className={styles.tab}
                onClick={() => setActiveTab("comments")}
              >
                Comments <span className={styles.tabCount}>{commentCount}</span>
              </button>
              <button
                type="button"
                role="tab"
                id="task-tab-files"
                aria-selected={activeTab === "files"}
                aria-controls="task-panel-files"
                className={styles.tab}
                onClick={() => setActiveTab("files")}
              >
                Files <span className={styles.tabCount}>{fileCount}</span>
              </button>
            </div>

            {activeTab === "comments" ? (
              <div id="task-panel-comments" role="tabpanel" aria-labelledby="task-tab-comments" className={styles.tabPanel}>
                {commentsError && (
                  <p className={styles.error} role="alert">
                    {commentsError}
                  </p>
                )}

                {comments === null ? (
                  <p className={styles.emptyText}>Loading comments…</p>
                ) : comments.length === 0 ? (
                  <p className={styles.emptyText}>No comments yet.</p>
                ) : (
                  <ul className={styles.commentList}>
                    {comments.map((comment) => (
                      <li key={comment.id} className={styles.commentRow}>
                        <div className={styles.commentHeader}>
                          <span className={styles.commentAuthor}>
                            {comment.author_name}
                            {comment.author_type === "client" && <span className={styles.clientBadge}>Client</span>}
                          </span>
                          <span className={styles.commentTimestamp}>{formatTimestamp(comment.created_at)}</span>
                          {(comment.author_user_id === currentUserId || canModerateComments) && (
                            <button
                              type="button"
                              className={styles.commentDelete}
                              onClick={() => handleDeleteComment(comment.id)}
                              aria-label="Delete comment"
                            >
                              <X aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <p className={styles.commentBody}>{comment.body}</p>
                        {comment.attachment && (
                          <a
                            className={styles.commentAttachment}
                            href={getTaskFileDownloadUrl(
                              agencyId,
                              projectId,
                              currentTask.id,
                              comment.attachment.id,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Paperclip className={styles.commentAttachmentIcon} aria-hidden="true" />
                            <span className={styles.commentAttachmentName}>{comment.attachment.file_name}</span>
                            <span className={styles.commentAttachmentSize}>
                              {formatFileSize(comment.attachment.size)}
                            </span>
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <form className={styles.commentForm} onSubmit={handlePostComment}>
                  <textarea
                    className={styles.commentInput}
                    rows={2}
                    placeholder="Write a comment…"
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    aria-label="New comment"
                  />
                  <div className={styles.commentFormActions}>
                    <label className={styles.commentAttach}>
                      <Paperclip aria-hidden="true" />
                      <span>{commentFile ? commentFile.name : "Attach a file"}</span>
                      <input
                        ref={commentFileRef}
                        type="file"
                        accept={ACCEPTED_FILE_TYPES}
                        className={styles.uploadInput}
                        onChange={(event) => setCommentFile(event.target.files?.[0] ?? null)}
                        disabled={isPostingComment}
                      />
                    </label>
                    {commentFile && (
                      <button
                        type="button"
                        className={styles.commentAttachClear}
                        onClick={() => {
                          setCommentFile(null);
                          if (commentFileRef.current) commentFileRef.current.value = "";
                        }}
                        aria-label="Remove attached file"
                      >
                        <X aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="submit"
                      className={styles.commentSubmit}
                      disabled={isPostingComment || !newComment.trim()}
                    >
                      Post
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div id="task-panel-files" role="tabpanel" aria-labelledby="task-tab-files" className={styles.tabPanel}>
                {filesError && (
                  <p className={styles.error} role="alert">
                    {filesError}
                  </p>
                )}

                {files === null ? (
                  <p className={styles.emptyText}>Loading files…</p>
                ) : files.length === 0 ? (
                  <p className={styles.emptyText}>No files attached yet.</p>
                ) : (
                  <ul className={styles.fileList}>
                    {files.map((file) => (
                      <li key={file.id} className={styles.fileRow}>
                        <a
                          href={getTaskFileDownloadUrl(agencyId, projectId, currentTask.id, file.id)}
                          className={styles.fileLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Paperclip className={styles.fileIcon} aria-hidden="true" />
                          <span className={styles.fileName}>{file.file_name}</span>
                        </a>
                        <span className={styles.fileMeta}>{formatFileSize(file.size)}</span>
                        <button
                          type="button"
                          className={styles.fileDelete}
                          onClick={() => handleDeleteFile(file.id)}
                          disabled={isUploading}
                          aria-label={`Delete ${file.file_name}`}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <label className={styles.uploadTrigger}>
                  <Paperclip aria-hidden="true" /> {isUploading ? "Working…" : "Attach a file"}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILE_TYPES}
                    className={styles.uploadInput}
                    onChange={handleUploadFile}
                    disabled={isUploading}
                  />
                </label>
                <p className={styles.uploadHint}>Images, PDFs, or Word documents.</p>
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default TaskDetailPanel;

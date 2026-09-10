/**
 * BoardCommentsDialog.tsx
 *
 * The small modal that opens from a selected card's comment button. Lists the
 * card's comment thread, lets anyone on the project add one, and lets a person
 * delete their own (an agency owner/admin can delete any — `canModerate`).
 *
 * Thread state lives in `useBoardStore.commentsByItem` so the realtime
 * `board.comment.*` events and this dialog stay in sync: the dialog fetches on
 * open, and every add/delete (local or remote) flows through the same store
 * actions.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardCommentsDialog.tsx
 * @author Binx.io
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { MessageCircle, Trash2 } from "lucide-react";

import type { BoardItem } from "@/lib/boards-client";
import { relativeTime } from "@/lib/notifications-client";
import { useBoardStore } from "@/stores/use-board-store";

import styles from "./BoardCommentsDialog.module.scss";
import type { BoardCanvasActions } from "./BoardCanvas";

interface BoardCommentsDialogProps {
  item: BoardItem;
  actions: BoardCanvasActions;
  currentUserId: string;
  canModerate: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError: (message: string) => void;
}

const cardLabel = (item: BoardItem): string => {
  if (item.type === "note") {
    const text = "text" in item.content ? item.content.text.trim() : "";
    return text ? `“${text.slice(0, 40)}${text.length > 40 ? "…" : ""}”` : "this note";
  }
  return "this image";
};

const BoardCommentsDialog = ({
  item,
  actions,
  currentUserId,
  canModerate,
  open,
  onOpenChange,
  onError,
}: BoardCommentsDialogProps) => {
  const comments = useBoardStore((s) => s.commentsByItem[item.id]);
  const setComments = useBoardStore((s) => s.setComments);
  const addComment = useBoardStore((s) => s.addComment);
  const removeComment = useBoardStore((s) => s.removeComment);

  // The dialog only mounts once its card opens it, so this effect is the "on
  // open" fetch. `loading` starts true only when there's nothing cached to show.
  const [loading, setLoading] = useState(comments === undefined);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await actions.listComments(item.id);
      if (cancelled) return;
      if (r.error || !r.comments) onError(r.error ?? "Unable to load comments");
      else setComments(item.id, r.comments);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on open
  }, [item.id]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [comments?.length]);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const { comment, error } = await actions.addComment(item.id, trimmed);
    setSending(false);
    if (error || !comment) {
      onError(error ?? "Unable to add the comment");
      return;
    }
    addComment(comment);
    setBody("");
  };

  const del = async (commentId: string) => {
    const snapshot = comments ?? [];
    removeComment(item.id, commentId);
    const { error } = await actions.deleteComment(item.id, commentId);
    if (error) {
      setComments(item.id, snapshot); // put it back
      onError(error);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.dialog} aria-label="Card comments">
          <Dialog.Title className={styles.title}>Comments</Dialog.Title>
          <Dialog.Description className={styles.subtitle}>On {cardLabel(item)}</Dialog.Description>

          <div className={styles.thread}>
            {loading ? (
              <p className={styles.empty}>Loading…</p>
            ) : (comments?.length ?? 0) === 0 ? (
              <p className={styles.empty}>
                <MessageCircle aria-hidden="true" />
                No comments yet — start the conversation.
              </p>
            ) : (
              comments!.map((comment) => {
                const canDelete = canModerate || comment.author_user_id === currentUserId;
                return (
                  <div key={comment.id} className={styles.comment}>
                    <div className={styles.commentHead}>
                      <span className={styles.author} data-client={comment.author_kind === "client"}>
                        {comment.author_name}
                      </span>
                      <span className={styles.time}>{relativeTime(comment.created_at)}</span>
                      {canDelete && (
                        <button
                          type="button"
                          className={styles.deleteComment}
                          onClick={() => del(comment.id)}
                          aria-label="Delete comment"
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    <p className={styles.body}>{comment.body}</p>
                  </div>
                );
              })
            )}
            <div ref={listEndRef} />
          </div>

          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <textarea
              className={styles.input}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a comment…"
              rows={2}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <div className={styles.composerActions}>
              <Dialog.Close className={styles.cancel}>Close</Dialog.Close>
              <button type="submit" className={styles.send} disabled={!body.trim() || sending}>
                {sending ? "Sending…" : "Comment"}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default BoardCommentsDialog;

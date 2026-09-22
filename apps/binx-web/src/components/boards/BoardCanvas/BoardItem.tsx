/**
 * BoardItem.tsx
 *
 * One card on the collaboration canvas. Handles its own pointer-drag (move),
 * corner-handle resize, note text editing, colour, delete, emoji reactions and
 * the comments dialog — all optimistic against `useBoardStore`, persisted to
 * the server on gesture-end, and reconciled by the realtime broadcast.
 * Geometry math converts screen deltas to canvas units by dividing by the
 * current zoom.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardItem.tsx
 * @author Binx.io
 */
"use client";

import { useRef, useState } from "react";
import { MessageCircle, Trash2 } from "lucide-react";

import {
  clamp,
  DEFAULT_NOTE_COLOR,
  MAX_ITEM_SIZE,
  MIN_ITEM_SIZE,
  NOTE_COLORS,
  noteText,
  REACTION_EMOJI,
  type BoardItem as BoardItemModel,
} from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";
import BoardCommentsDialog from "@/components/boards/BoardCanvas/BoardCommentsDialog";

import styles from "./BoardCanvas.module.scss";
import type { BoardCanvasActions } from "./BoardCanvas";

interface BoardItemProps {
  item: BoardItemModel;
  zoom: number;
  selected: boolean;
  actions: BoardCanvasActions;
  imageUrl: (fileId: string) => string;
  currentUserId: string;
  canModerate: boolean;
  viewerKind: "agency" | "client";
  onSelect: () => void;
  onError: (message: string) => void;
}

type Gesture = { mode: "move" | "resize"; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number };

const BoardItemView = ({
  item,
  zoom,
  selected,
  actions,
  imageUrl,
  currentUserId,
  canModerate,
  viewerKind,
  onSelect,
  onError,
}: BoardItemProps) => {
  const patchItem = useBoardStore((s) => s.patchItem);
  const removeItem = useBoardStore((s) => s.removeItem);
  const upsertItem = useBoardStore((s) => s.upsertItem);
  const setActive = useBoardStore((s) => s.setActive);
  const setReactions = useBoardStore((s) => s.setReactions);

  const gestureRef = useRef<Gesture | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelledRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);

  // The toolbar (and its confirm step) only renders while selected, but this
  // component itself stays mounted across selection toggles — reset the
  // pending confirm when the card is deselected, adjusted during render
  // (React's own pattern for this, same as MemberDetailDrawer's
  // seededMemberId reset) rather than an effect, so re-selecting the card
  // later doesn't reopen "Delete this card?" out of nowhere.
  const [wasSelected, setWasSelected] = useState(selected);
  if (selected !== wasSelected) {
    setWasSelected(selected);
    if (!selected) {
      setConfirmingDelete(false);
      setRequestingChanges(false);
      setChangesNote("");
    }
  }

  const bumpToFront = () => {
    // A cheap "bring to front": one past the current view is fine, the server
    // reconciles the exact value.
    const maxZ = Math.max(0, ...Object.values(useBoardStore.getState().itemsById).map((i) => i.z));
    if (item.z < maxZ) {
      patchItem(item.id, { z: maxZ + 1 });
      return maxZ + 1;
    }
    return item.z;
  };

  const endGesture = (persist: () => Promise<{ error?: string }>) => {
    gestureRef.current = null;
    setActive(item.id, false);
    void persist().then((result) => {
      if (result.error) onError(result.error);
    });
  };

  const onPointerDownBody = (event: React.PointerEvent) => {
    if (editing) return;
    event.stopPropagation();
    onSelect();
    const z = bumpToFront();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setActive(item.id, true);
    gestureRef.current = {
      mode: "move",
      startX: event.clientX,
      startY: event.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height,
    };
    (gestureRef.current as Gesture & { z: number }).z = z;
  };

  const onPointerDownHandle = (event: React.PointerEvent) => {
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setActive(item.id, true);
    gestureRef.current = {
      mode: "resize",
      startX: event.clientX,
      startY: event.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const dx = (event.clientX - g.startX) / zoom;
    const dy = (event.clientY - g.startY) / zoom;
    if (g.mode === "move") {
      patchItem(item.id, { x: g.origX + dx, y: g.origY + dy });
    } else {
      patchItem(item.id, {
        width: clamp(g.origW + dx, MIN_ITEM_SIZE, MAX_ITEM_SIZE),
        height: clamp(g.origH + dy, MIN_ITEM_SIZE, MAX_ITEM_SIZE),
      });
    }
  };

  const onPointerUp = () => {
    const g = gestureRef.current;
    if (!g) return;
    const fresh = useBoardStore.getState().itemsById[item.id];
    if (!fresh) {
      gestureRef.current = null;
      setActive(item.id, false);
      return;
    }
    if (g.mode === "move") {
      const z = (g as Gesture & { z?: number }).z ?? fresh.z;
      endGesture(() => actions.update(item.id, { x: fresh.x, y: fresh.y, z }));
    } else {
      endGesture(() => actions.update(item.id, { width: fresh.width, height: fresh.height }));
    }
  };

  const startEditing = () => {
    if (item.type !== "note") return;
    cancelledRef.current = false;
    setEditing(true);
    setActive(item.id, true);
  };

  const commitText = () => {
    setEditing(false);
    setActive(item.id, false);
    const next = textRef.current?.value ?? noteText(item);
    if (cancelledRef.current || next === noteText(item)) return;
    patchItem(item.id, { content: { text: next } }); // optimistic
    void actions.update(item.id, { content: { text: next } }).then((r) => r.error && onError(r.error));
  };

  const applyColor = (color: string) => {
    const clearing = color === DEFAULT_NOTE_COLOR && item.color === null;
    if (clearing) return;
    patchItem(item.id, { color });
    void actions.update(item.id, { color }).then((r) => r.error && onError(r.error));
  };

  const handleDelete = () => {
    const snapshot = item;
    removeItem(item.id);
    void actions.remove(item.id).then((r) => {
      if (r.error) {
        upsertItem(snapshot);
        onError(r.error);
      }
    });
  };

  const toggleReaction = (kind: string) => {
    const has = item.my_reactions.includes(kind);
    const optimisticMine = has ? item.my_reactions.filter((k) => k !== kind) : [...item.my_reactions, kind];
    const optimisticCounts = { ...item.reactions };
    optimisticCounts[kind] = Math.max(0, (optimisticCounts[kind] ?? 0) + (has ? -1 : 1));
    if (optimisticCounts[kind] === 0) delete optimisticCounts[kind];
    setReactions(item.id, optimisticCounts, optimisticMine);

    void actions.toggleReaction(item.id, kind).then((r) => {
      if (r.error || !r.result) {
        setReactions(item.id, item.reactions, item.my_reactions); // revert
        onError(r.error ?? "Unable to react");
        return;
      }
      setReactions(item.id, r.result.reactions, r.result.my_reactions);
    });
  };

  const runApproval = (fn: () => Promise<{ item?: BoardItemModel; error?: string }>) => {
    setApprovalBusy(true);
    void fn().then((r) => {
      setApprovalBusy(false);
      if (r.error) {
        onError(r.error);
        return;
      }
      if (r.item) upsertItem(r.item);
    });
  };

  const requestApproval = () => {
    if (!actions.requestApproval) return;
    runApproval(() => actions.requestApproval!(item.id));
  };

  const withdrawApproval = () => {
    if (!actions.withdrawApproval) return;
    runApproval(() => actions.withdrawApproval!(item.id));
  };

  const approve = () => {
    if (!actions.decideApproval) return;
    runApproval(() => actions.decideApproval!(item.id, "approved"));
  };

  const sendRequestedChanges = () => {
    if (!actions.decideApproval) return;
    const note = changesNote.trim();
    runApproval(() => actions.decideApproval!(item.id, "changes_requested", note || undefined));
    setRequestingChanges(false);
    setChangesNote("");
  };

  return (
    <div
      className={styles.item}
      data-type={item.type}
      data-author={item.author_kind}
      data-selected={selected}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.z,
        background: item.type === "note" ? (item.color ?? DEFAULT_NOTE_COLOR) : undefined,
      }}
      onPointerDown={onPointerDownBody}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={startEditing}
    >
      {item.type === "note" ? (
        editing ? (
          <textarea
            ref={textRef}
            autoFocus
            className={styles.noteInput}
            defaultValue={noteText(item)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                cancelledRef.current = true;
                setEditing(false);
                setActive(item.id, false);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <p className={styles.noteText} data-empty={noteText(item) === ""}>
            {noteText(item) || "Double-click to write…"}
          </p>
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- canvas images are user-positioned at arbitrary sizes; next/image's layout constraints don't fit a freeform board
        <img
          className={styles.image}
          src={
            item.content && "file_id" in item.content && item.content.file_id
              ? imageUrl(item.content.file_id)
              : ""
          }
          alt={("file_name" in item.content && item.content.file_name) || "Canvas image"}
          draggable={false}
        />
      )}

      {/* Who dropped the card — a faint tag above it, revealed on hover/select
          (styling in .authorTag). */}
      <span className={styles.authorTag} data-client={item.author_kind === "client"} aria-hidden="true">
        {item.created_by_name}
      </span>

      {/* Approval state — visible whenever set, not just on hover/select, so
          a resting board still shows what's waiting on the client. */}
      {item.approval_status && (
        <div className={styles.approvalBadge} data-status={item.approval_status} onPointerDown={(e) => e.stopPropagation()}>
          <span className={styles.approvalStatus}>
            {item.approval_status === "pending" && "Awaiting approval"}
            {item.approval_status === "approved" &&
              (item.approval_decided_by_name ? `Approved by ${item.approval_decided_by_name}` : "Approved")}
            {item.approval_status === "changes_requested" &&
              (item.approval_decided_by_name
                ? `Changes requested by ${item.approval_decided_by_name}`
                : "Changes requested")}
          </span>
          {item.approval_status === "changes_requested" && item.approval_note && (
            <p className={styles.approvalNote}>“{item.approval_note}”</p>
          )}
        </div>
      )}

      {/* Reaction pills sit above the card whenever there are any — visible
          without selecting, like Milanote / Figma. */}
      {Object.keys(item.reactions).length > 0 && (
        <div className={styles.reactionPills} onPointerDown={(e) => e.stopPropagation()}>
          {REACTION_EMOJI.filter((e) => item.reactions[e]).map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.reactionPill}
              data-mine={item.my_reactions.includes(emoji)}
              onClick={() => toggleReaction(emoji)}
            >
              <span aria-hidden="true">{emoji}</span> {item.reactions[emoji]}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className={styles.itemBar} onPointerDown={(e) => e.stopPropagation()}>
            {confirmingDelete ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmText}>Delete this card?</span>
                <div className={styles.confirmActions}>
                  <button type="button" className={styles.confirmDelete} onClick={handleDelete}>
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    className={styles.confirmCancel}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : requestingChanges ? (
              <div className={styles.confirmRow}>
                <input
                  className={styles.changesInput}
                  value={changesNote}
                  onChange={(e) => setChangesNote(e.target.value)}
                  placeholder="What needs to change? (optional)"
                  onPointerDown={(e) => e.stopPropagation()}
                  autoFocus
                />
                <div className={styles.confirmActions}>
                  <button type="button" className={styles.confirmDelete} data-tone="changes" onClick={sendRequestedChanges}>
                    Send
                  </button>
                  <button
                    type="button"
                    className={styles.confirmCancel}
                    onClick={() => {
                      setRequestingChanges(false);
                      setChangesNote("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <span className={styles.reactionPicker}>
                  {REACTION_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={styles.reactionChoice}
                      data-mine={item.my_reactions.includes(emoji)}
                      aria-label={`React ${emoji}`}
                      onClick={() => toggleReaction(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  className={styles.commentButton}
                  data-has={item.comment_count > 0}
                  onClick={() => setCommentsOpen(true)}
                  aria-label={`Comments (${item.comment_count})`}
                >
                  <MessageCircle aria-hidden="true" />
                  {item.comment_count > 0 && <span>{item.comment_count}</span>}
                </button>
                {item.type === "note" && (
                  <>
                    <span className={styles.barDivider} aria-hidden="true" />
                    <span className={styles.swatches}>
                      {NOTE_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={styles.swatch}
                          style={{ background: color }}
                          aria-label={`Colour ${color}`}
                          onClick={() => applyColor(color)}
                        />
                      ))}
                    </span>
                  </>
                )}
                {viewerKind === "agency" && actions.requestApproval && (
                  <>
                    <span className={styles.barDivider} aria-hidden="true" />
                    {item.approval_status === "pending" ? (
                      <button
                        type="button"
                        className={styles.approvalButton}
                        onClick={withdrawApproval}
                        disabled={approvalBusy}
                      >
                        Withdraw request
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.approvalButton}
                        data-tone="accent"
                        onClick={requestApproval}
                        disabled={approvalBusy}
                      >
                        {item.approval_status ? "Request re-approval" : "Request approval"}
                      </button>
                    )}
                  </>
                )}
                {viewerKind === "client" && actions.decideApproval && item.approval_status === "pending" && (
                  <>
                    <span className={styles.barDivider} aria-hidden="true" />
                    <button
                      type="button"
                      className={styles.approvalButton}
                      data-tone="approve"
                      onClick={approve}
                      disabled={approvalBusy}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={styles.approvalButton}
                      onClick={() => setRequestingChanges(true)}
                      disabled={approvalBusy}
                    >
                      Request changes
                    </button>
                  </>
                )}
                <span className={styles.barDivider} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.itemDelete}
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete card"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          <div
            className={styles.resizeHandle}
            onPointerDown={onPointerDownHandle}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        </>
      )}

      {commentsOpen && (
        <BoardCommentsDialog
          item={item}
          actions={actions}
          currentUserId={currentUserId}
          canModerate={canModerate}
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
          onError={onError}
        />
      )}
    </div>
  );
};

export default BoardItemView;

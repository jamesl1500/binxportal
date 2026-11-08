/**
 * BoardItem.tsx
 *
 * One card on the collaboration canvas — free on the board, or stacked inside
 * a column (`inColumn`). Owns the shared card chrome: selection, the
 * floating toolbar (reactions, comments, version history, colour, approval,
 * delete), the resize handle, and the approval / reaction / author meta row.
 * The body is per type (note, image, pin, to-do, link, file, board, column);
 * connector lines are drawn separately by BoardLines.
 *
 * Moving a card is a canvas-level gesture (`startDrag` from context) so a
 * card can be dragged out of a column, into another, or onto a board card;
 * resize stays local. Everything is optimistic against `useBoardStore`,
 * persisted on gesture end, and reconciled by the realtime broadcast.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardItem.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  History,
  MessageCircle,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  APPROVABLE_TYPES,
  AUTO_HEIGHT_TYPES,
  BOARD_COLORS,
  childBoardId,
  clamp,
  columnApprovalSummary,
  DEFAULT_NOTE_COLOR,
  MAX_ITEM_SIZE,
  MIN_ITEM_SIZE,
  NOTE_COLORS,
  noteText,
  REACTION_EMOJI,
  type BoardItem as BoardItemModel,
  type LinkContent,
} from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";
import BoardCommentsDialog from "@/components/boards/BoardCanvas/BoardCommentsDialog";
import BoardVersionsDialog from "@/components/boards/BoardCanvas/BoardVersionsDialog";
import {
  isInteractiveTarget,
  useBoardCanvas,
} from "@/components/boards/BoardCanvas/BoardCanvasContext";
import ColumnCard, {
  useColumnChildren,
} from "@/components/boards/BoardCanvas/cards/ColumnCard";
import TodoCard from "@/components/boards/BoardCanvas/cards/TodoCard";
import {
  BoardCard,
  FileCard,
  LinkCard,
} from "@/components/boards/BoardCanvas/cards/SimpleCards";

import styles from "./BoardCanvas.module.scss";

interface BoardItemProps {
  item: BoardItemModel;
  /** Rendered inside a column's stack rather than absolutely on the board. */
  inColumn?: boolean;
}

type Resize = {
  startX: number;
  startY: number;
  origW: number;
  origH: number;
};

const DELETE_PROMPT: Partial<Record<BoardItemModel["type"], string>> = {
  board: "Delete this board and everything on it?",
  column: "Delete this column? Its cards stay on the board.",
  todo: "Delete this list? Its tasks stay on the Board tab.",
};

const BoardItemView = ({ item, inColumn = false }: BoardItemProps) => {
  const ctx = useBoardCanvas();
  const {
    actions,
    viewerKind,
    zoom,
    selectedId,
    select,
    startDrag,
    startConnect,
    dropTarget,
    autoEditId,
    autoOpenCommentsId,
    openBoard,
    onError,
  } = ctx;
  const selected = selectedId === item.id;

  const patchItem = useBoardStore((s) => s.patchItem);
  const removeItem = useBoardStore((s) => s.removeItem);
  const upsertItem = useBoardStore((s) => s.upsertItem);
  const setActive = useBoardStore((s) => s.setActive);
  const setReactions = useBoardStore((s) => s.setReactions);
  const setSize = useBoardStore((s) => s.setSize);

  const elRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<Resize | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelledRef = useRef(false);

  const autoEdit = autoEditId === item.id;
  const [editing, setEditing] = useState(autoEdit && item.type === "note");
  const [commentsOpen, setCommentsOpen] = useState(autoOpenCommentsId === item.id);
  // The initializers above only cover mounting with the flags already set.
  // The realtime broadcast can mount this card (via the websocket's upsert)
  // before BoardCanvas's local flag lands, so a flag can turn on after first
  // mount too — adjust state during render (React's documented pattern),
  // not in an effect, so it isn't a second cascading render.
  const [seenAutoEdit, setSeenAutoEdit] = useState(autoEdit);
  if (autoEdit !== seenAutoEdit) {
    setSeenAutoEdit(autoEdit);
    if (autoEdit && item.type === "note") setEditing(true);
  }
  const [seenAutoOpen, setSeenAutoOpen] = useState(autoOpenCommentsId === item.id);
  if ((autoOpenCommentsId === item.id) !== seenAutoOpen) {
    setSeenAutoOpen(autoOpenCommentsId === item.id);
    if (autoOpenCommentsId === item.id) setCommentsOpen(true);
  }

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);

  // The toolbar only renders while selected, but this component stays
  // mounted across selection toggles — reset pending confirms on deselect,
  // during render (same pattern as MemberDetailDrawer's seededMemberId).
  const [wasSelected, setWasSelected] = useState(selected);
  if (selected !== wasSelected) {
    setWasSelected(selected);
    if (!selected) {
      setConfirmingDelete(false);
      setRequestingChanges(false);
      setChangesNote("");
      setEditingLink(false);
    }
  }

  const columnChildren = useColumnChildren(item.type === "column" ? item.id : "");

  // Report the rendered size — auto-height cards and columns don't keep
  // `height` current, and connector lines / the minimap need the real box.
  useEffect(() => {
    const el = elRef.current;
    if (!el || inColumn || typeof ResizeObserver === "undefined") return;
    const report = () => setSize(item.id, el.offsetWidth, el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [item.id, inColumn, setSize]);

  const versionSuffix =
    item.version_number != null ? ` (v${item.version_number})` : "";
  const autoHeight = AUTO_HEIGHT_TYPES.has(item.type);

  // ---- Gestures ----

  const onPointerDownBody = (event: React.PointerEvent) => {
    if (editing || event.button !== 0) return;
    event.stopPropagation();
    select(item.id);
    if (isInteractiveTarget(event.target)) return;
    // No native text-selection drag — it would auto-scroll the board.
    event.preventDefault();
    startDrag(item, event);
  };

  const onPointerDownHandle = (event: React.PointerEvent) => {
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setActive(item.id, true);
    const el = elRef.current;
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origW: item.width,
      origH: autoHeight && el ? el.offsetHeight : item.height,
    };
  };

  const onPointerMoveHandle = (event: React.PointerEvent) => {
    const g = resizeRef.current;
    if (!g) return;
    const dx = (event.clientX - g.startX) / zoom;
    const dy = (event.clientY - g.startY) / zoom;
    patchItem(item.id, {
      width: clamp(g.origW + dx, MIN_ITEM_SIZE, MAX_ITEM_SIZE),
      ...(autoHeight
        ? {}
        : { height: clamp(g.origH + dy, MIN_ITEM_SIZE, MAX_ITEM_SIZE) }),
    });
  };

  const onPointerUpHandle = () => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    setActive(item.id, false);
    const fresh = useBoardStore.getState().itemsById[item.id];
    if (!fresh) return;
    void actions
      .update(item.id, {
        width: fresh.width,
        ...(autoHeight ? {} : { height: fresh.height }),
      })
      .then((r) => r.error && onError(r.error));
  };

  // ---- Edits ----

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
    void actions
      .update(item.id, { content: { text: next } })
      .then((r) => r.error && onError(r.error));
  };

  const saveTitle = (title: string) => {
    patchItem(item.id, { content: { ...item.content, title } });
    void actions.update(item.id, { content: { title } }).then((r) => {
      if (r.error) return onError(r.error);
      if (r.item) upsertItem(r.item);
    });
  };

  const saveLink = () => {
    const url = linkDraft.trim();
    setEditingLink(false);
    if (!url || url === (item.content as LinkContent).url) return;
    void actions.update(item.id, { content: { url } }).then((r) => {
      if (r.error) return onError(r.error);
      if (r.item) upsertItem(r.item);
    });
  };

  const applyColor = (color: string) => {
    if (color === item.color) return;
    patchItem(item.id, { color });
    void actions
      .update(item.id, { color })
      .then((r) => r.error && onError(r.error));
  };

  const handleDelete = () => {
    const snapshot = item;
    removeItem(item.id);
    select(null);
    // A column's stack lands back on the board — the server broadcasts the
    // released cards; drop them locally too so they don't vanish meanwhile.
    for (const child of columnChildren) {
      patchItem(child.id, { clear_parent: true, x: item.x, y: item.y + 56 });
    }
    void actions.remove(item.id).then((r) => {
      if (r.error) {
        upsertItem(snapshot);
        onError(r.error);
      }
    });
  };

  const toggleReaction = (kind: string) => {
    const has = item.my_reactions.includes(kind);
    const optimisticMine = has
      ? item.my_reactions.filter((k) => k !== kind)
      : [...item.my_reactions, kind];
    const optimisticCounts = { ...item.reactions };
    optimisticCounts[kind] = Math.max(
      0,
      (optimisticCounts[kind] ?? 0) + (has ? -1 : 1),
    );
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

  // ---- Approval ----

  const isColumn = item.type === "column";
  const approvable = APPROVABLE_TYPES.has(item.type);
  const summary = columnApprovalSummary(columnChildren);

  /** A column's request/decision fans out server-side to its stack; mirror
   * that locally so the cards update even before (or without) the socket. */
  const applyToChildren = (fn: (child: BoardItemModel) => BoardItemModel | null) => {
    for (const child of columnChildren) {
      if (!APPROVABLE_TYPES.has(child.type)) continue;
      const next = fn(child);
      if (next) upsertItem(next);
    }
  };

  const runApproval = (
    fn: () => Promise<{ item?: BoardItemModel; error?: string }>,
    onSuccess?: () => void,
  ) => {
    setApprovalBusy(true);
    void fn().then((r) => {
      setApprovalBusy(false);
      if (r.error) {
        onError(r.error);
        return;
      }
      if (r.item) upsertItem(r.item);
      onSuccess?.();
    });
  };

  const requestApproval = () => {
    if (!actions.requestApproval) return;
    runApproval(
      () => actions.requestApproval!(item.id),
      isColumn
        ? () =>
            applyToChildren((c) =>
              c.approval_status === "pending"
                ? null
                : {
                    ...c,
                    approval_status: "pending",
                    approval_decided_by_name: null,
                    approval_note: null,
                    version_number: (c.version_number ?? 0) + 1,
                  },
            )
        : undefined,
    );
  };

  const withdrawApproval = () => {
    if (!actions.withdrawApproval) return;
    runApproval(
      () => actions.withdrawApproval!(item.id),
      isColumn
        ? () =>
            applyToChildren((c) =>
              c.approval_status === "pending"
                ? { ...c, approval_status: null }
                : null,
            )
        : undefined,
    );
  };

  const decide = (decision: "approved" | "changes_requested", note?: string) => {
    if (!actions.decideApproval) return;
    runApproval(
      () =>
        note === undefined
          ? actions.decideApproval!(item.id, decision)
          : actions.decideApproval!(item.id, decision, note),
      isColumn
        ? () =>
            applyToChildren((c) =>
              c.approval_status === "pending"
                ? {
                    ...c,
                    approval_status: decision,
                    approval_note: note ?? null,
                    approved_version_number:
                      decision === "approved"
                        ? c.version_number
                        : c.approved_version_number,
                  }
                : null,
            )
        : undefined,
    );
  };

  const sendRequestedChanges = () => {
    const note = changesNote.trim();
    decide("changes_requested", note || undefined);
    setRequestingChanges(false);
    setChangesNote("");
  };

  // ---- Render ----

  const background =
    item.type === "note" ? (item.color ?? DEFAULT_NOTE_COLOR) : undefined;
  const style: React.CSSProperties = inColumn
    ? {
        background,
        aspectRatio:
          item.type === "image" ? `${item.width} / ${item.height}` : undefined,
        minHeight: item.type === "note" ? Math.min(item.height, 120) : undefined,
      }
    : {
        left: item.x,
        top: item.y,
        width: item.width,
        height: autoHeight ? undefined : item.height,
        zIndex: selected ? 100_000 : item.z,
        background,
      };

  const childBoard = childBoardId(item);
  const canEditStructure = true; // full collaboration — both sides edit
  const isDropBoard =
    dropTarget?.kind === "board" && dropTarget.id === item.id;
  const swatches =
    item.type === "note"
      ? NOTE_COLORS
      : item.type === "board" || item.type === "column"
        ? BOARD_COLORS
        : null;

  const body = (() => {
    switch (item.type) {
      case "note":
        return editing ? (
          <textarea
            ref={textRef}
            autoFocus
            className={styles.noteInput}
            defaultValue={noteText(item)}
            aria-label="Note text"
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
        );
      case "pin":
        return (
          <div className={styles.pinShape} aria-hidden="true">
            <div className={styles.pinTail} />
            <div className={styles.pinHead}>
              <MessageSquare aria-hidden="true" />
              {item.comment_count > 0 && (
                <span className={styles.pinCount}>{item.comment_count}</span>
              )}
            </div>
          </div>
        );
      case "image":
        return (
          // eslint-disable-next-line @next/next/no-img-element -- canvas images are user-positioned at arbitrary sizes; next/image's layout constraints don't fit a freeform board
          <img
            className={styles.image}
            src={
              "file_id" in item.content && item.content.file_id
                ? ctx.imageUrl(item.content.file_id)
                : ""
            }
            alt={
              ("file_name" in item.content && item.content.file_name) ||
              "Canvas image"
            }
            draggable={false}
          />
        );
      case "todo":
        return <TodoCard item={item} autoEdit={autoEdit} onSaveTitle={saveTitle} />;
      case "link":
        return <LinkCard item={item} />;
      case "file":
        return <FileCard item={item} fileUrl={ctx.fileUrl} />;
      case "board":
        return (
          <BoardCard
            item={item}
            autoEdit={autoEdit}
            canEdit={canEditStructure}
            onSaveTitle={saveTitle}
            onOpen={openBoard}
            dropping={isDropBoard}
          />
        );
      case "column":
        return (
          <ColumnCard
            item={item}
            autoEdit={autoEdit}
            canEdit={canEditStructure}
            onSaveTitle={saveTitle}
            renderChild={(child) => <BoardItemView key={child.id} item={child} inColumn />}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div
      ref={elRef}
      className={styles.item}
      data-item-id={item.id}
      data-type={item.type}
      data-author={item.author_kind}
      data-selected={selected}
      data-in-column={inColumn || undefined}
      data-column-child={inColumn || undefined}
      data-drop-column={isColumn || undefined}
      data-drop-board={childBoard ?? undefined}
      style={{
        ...style,
        ...(isColumn && item.color ? { ["--column-accent" as string]: item.color } : {}),
      }}
      onPointerDown={onPointerDownBody}
      onDoubleClick={startEditing}
    >
      {body}

      {/* Everything that floats above the card shares one row (.itemMeta) so
          the approval badge, reaction pills and author tag lay out next to
          each other instead of stacking on the same spot. */}
      <div className={styles.itemMeta}>
        {/* Approval state — visible whenever set, so a resting board still
          shows what's waiting on the client. Each decision is tied to a
          pinned version number. */}
        {item.approval_status && (
          <div
            className={styles.approvalBadge}
            data-status={item.approval_status}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className={styles.approvalStatus}>
              {item.approval_status === "pending" &&
                `Awaiting approval${versionSuffix}`}
              {item.approval_status === "approved" &&
                (item.approval_decided_by_name
                  ? `Approved by ${item.approval_decided_by_name}${versionSuffix}`
                  : `Approved${versionSuffix}`)}
              {item.approval_status === "changes_requested" &&
                (item.approval_decided_by_name
                  ? `Changes requested by ${item.approval_decided_by_name}${versionSuffix}`
                  : `Changes requested${versionSuffix}`)}
            </span>
            {item.approval_status === "changes_requested" &&
              item.approval_note && (
                <p className={styles.approvalNote}>“{item.approval_note}”</p>
              )}
          </div>
        )}

        {/* Edited since its last approved snapshot — the decision was cleared
          (boards/service.py::update_item), but the earlier sign-off is still
          pinned and viewable in the history dialog. */}
        {!item.approval_status && item.approved_version_number != null && (
          <div
            className={styles.approvalBadge}
            data-status="pending"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className={styles.approvalStatus}>
              Edited since approved v{item.approved_version_number}
            </span>
          </div>
        )}

        {Object.keys(item.reactions).length > 0 && (
          <div
            className={styles.reactionPills}
            onPointerDown={(e) => e.stopPropagation()}
          >
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

        <span
          className={styles.authorTag}
          data-client={item.author_kind === "client"}
          aria-hidden="true"
        >
          {item.created_by_name}
        </span>
      </div>

      {selected && (
        <>
          <div
            className={styles.itemBar}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {confirmingDelete ? (
              <div className={styles.confirmRow}>
                <span className={styles.confirmText}>
                  {DELETE_PROMPT[item.type] ?? "Delete this card?"}
                </span>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.confirmDelete}
                    onClick={handleDelete}
                  >
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
                  <button
                    type="button"
                    className={styles.confirmDelete}
                    data-tone="changes"
                    onClick={sendRequestedChanges}
                  >
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
            ) : editingLink ? (
              <div className={styles.confirmRow}>
                <input
                  className={styles.changesInput}
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveLink();
                    if (e.key === "Escape") setEditingLink(false);
                  }}
                  placeholder="https://"
                  aria-label="Link address"
                  autoFocus
                />
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.confirmDelete}
                    data-tone="neutral"
                    onClick={saveLink}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className={styles.confirmCancel}
                    onClick={() => setEditingLink(false)}
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
                {item.version_number != null && (
                  <button
                    type="button"
                    className={styles.commentButton}
                    onClick={() => setVersionsOpen(true)}
                    aria-label="Version history"
                  >
                    <History aria-hidden="true" />
                    <span>v{item.version_number}</span>
                  </button>
                )}
                {item.type === "board" && childBoard && (
                  <button
                    type="button"
                    className={styles.commentButton}
                    onClick={() => openBoard(childBoard)}
                  >
                    <ArrowUpRight aria-hidden="true" />
                    <span>Open board</span>
                  </button>
                )}
                {item.type === "link" && (
                  <button
                    type="button"
                    className={styles.commentButton}
                    onClick={() => {
                      setLinkDraft((item.content as LinkContent).url ?? "");
                      setEditingLink(true);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    <span>Edit link</span>
                  </button>
                )}
                {swatches && (
                  <>
                    <span className={styles.barDivider} aria-hidden="true" />
                    <span className={styles.swatches}>
                      {swatches.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={styles.swatch}
                          data-active={
                            (item.color ??
                              (item.type === "note" ? DEFAULT_NOTE_COLOR : null)) === color
                          }
                          style={{ background: color }}
                          aria-label={`Colour ${color}`}
                          onClick={() => applyColor(color)}
                        />
                      ))}
                    </span>
                  </>
                )}

                {/* Per-card approval (agency asks, client decides). */}
                {approvable && viewerKind === "agency" && actions.requestApproval && (
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
                        {item.approval_status
                          ? "Request re-approval"
                          : "Request approval"}
                      </button>
                    )}
                  </>
                )}
                {approvable &&
                  viewerKind === "client" &&
                  actions.decideApproval &&
                  item.approval_status === "pending" && (
                    <>
                      <span className={styles.barDivider} aria-hidden="true" />
                      <button
                        type="button"
                        className={styles.approvalButton}
                        data-tone="approve"
                        onClick={() => decide("approved")}
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

                {/* Column-wide review — sends / decides its whole stack. */}
                {isColumn && viewerKind === "agency" && actions.requestApproval && summary.total > 0 && (
                  <>
                    <span className={styles.barDivider} aria-hidden="true" />
                    {summary.pending > 0 && (
                      <button
                        type="button"
                        className={styles.approvalButton}
                        onClick={withdrawApproval}
                        disabled={approvalBusy}
                      >
                        Withdraw reviews
                      </button>
                    )}
                    {summary.pending < summary.total && (
                      <button
                        type="button"
                        className={styles.approvalButton}
                        data-tone="accent"
                        onClick={requestApproval}
                        disabled={approvalBusy}
                      >
                        Send column for review
                      </button>
                    )}
                  </>
                )}
                {isColumn &&
                  viewerKind === "client" &&
                  actions.decideApproval &&
                  summary.pending > 0 && (
                    <>
                      <span className={styles.barDivider} aria-hidden="true" />
                      <button
                        type="button"
                        className={styles.approvalButton}
                        data-tone="approve"
                        onClick={() => decide("approved")}
                        disabled={approvalBusy}
                      >
                        Approve all ({summary.pending})
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
          {item.type !== "pin" && !inColumn && (
            <>
              <div
                className={styles.resizeHandle}
                data-axis={autoHeight ? "x" : "both"}
                onPointerDown={onPointerDownHandle}
                onPointerMove={onPointerMoveHandle}
                onPointerUp={onPointerUpHandle}
              />
              <button
                type="button"
                className={styles.connectHandle}
                aria-label="Draw a line from this card"
                title="Drag to connect"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startConnect(item, e);
                }}
              />
            </>
          )}
        </>
      )}

      {commentsOpen && (
        <BoardCommentsDialog
          item={item}
          actions={actions}
          currentUserId={ctx.currentUserId}
          canModerate={ctx.canModerate}
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
          onError={onError}
        />
      )}

      {versionsOpen && (
        <BoardVersionsDialog
          item={item}
          actions={actions}
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          onError={onError}
        />
      )}
    </div>
  );
};

export default BoardItemView;

/**
 * BoardCanvas.tsx
 *
 * The project collaboration canvas — an infinite, pan/zoom surface of freely
 * positioned cards (notes + images) that the agency team and the client's
 * portal contacts edit together in real time. Context-agnostic: the staff and
 * portal pages pass in their own server actions via the `actions` prop and an
 * `imageUrl` builder, so one component serves both.
 *
 * Styled Miro-style: the canvas fills the whole frame and every control
 * (toolbar, zoom, minimap, live status, the client's review bar) floats over
 * it rather than sitting in a fixed header, so the working surface stays
 * edge-to-edge on both desktop and phone.
 *
 * Native pointer events only — no DnD library, matching KanbanBoard.tsx.
 * Live state lives in `useBoardStore`, kept current by `BoardProvider`.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardCanvas.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Maximize,
  MessageSquarePlus,
  Minus,
  Plus,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import type {
  BoardComment,
  BoardItem,
  BoardItemPatch,
  BoardItemVersion,
} from "@/lib/boards-client";
import {
  clamp,
  DEFAULT_NOTE_COLOR,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  PIN_SIZE,
  screenToCanvas,
} from "@/lib/boards-client";
import type { BoardReactions, CreateBoardItemInput } from "@/lib/boards";
import { useBoardStore } from "@/stores/use-board-store";
import BoardItemView from "@/components/boards/BoardCanvas/BoardItem";
import BoardMinimap from "@/components/boards/BoardCanvas/BoardMinimap";
import BoardReviewBar from "@/components/boards/BoardCanvas/BoardReviewBar";

import styles from "./BoardCanvas.module.scss";

export interface BoardCanvasActions {
  create: (
    input: CreateBoardItemInput,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  update: (
    id: string,
    patch: BoardItemPatch,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  remove: (id: string) => Promise<{ error?: string }>;
  uploadImage: (
    file: File,
    placement: { x: number; y: number; width?: number; height?: number },
  ) => Promise<{ item?: BoardItem; error?: string }>;
  toggleReaction: (
    id: string,
    kind: string,
  ) => Promise<{ result?: BoardReactions; error?: string }>;
  listComments: (
    id: string,
  ) => Promise<{ comments?: BoardComment[]; error?: string }>;
  addComment: (
    id: string,
    body: string,
  ) => Promise<{ comment?: BoardComment; error?: string }>;
  deleteComment: (id: string, commentId: string) => Promise<{ error?: string }>;
  /** Agency side only — asks the client to review this card. */
  requestApproval?: (
    id: string,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  /** Agency side only — clears the card's approval state. */
  withdrawApproval?: (
    id: string,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  /** Client-portal side only — approves or asks for changes on a pending card. */
  decideApproval?: (
    id: string,
    decision: "approved" | "changes_requested",
    note?: string,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  /** A card's approval history — every version it's ever been through. */
  listVersions: (
    id: string,
  ) => Promise<{ versions?: BoardItemVersion[]; error?: string }>;
}

interface BoardCanvasProps {
  actions: BoardCanvasActions;
  imageUrl: (fileId: string) => string;
  currentUserId: string;
  /** Agency owner/admin — can delete anyone's comment (moderation). */
  canModerate: boolean;
  /** Who's viewing — decides which approval controls a card shows. */
  viewerKind: "agency" | "client";
}

const IMAGE_TARGET = 360;
const FOCUS_PADDING = 96;
const ANIMATE_MS = 240;

type PanPoint = { x: number; y: number };

const BoardCanvas = ({
  actions,
  imageUrl,
  currentUserId,
  canModerate,
  viewerKind,
}: BoardCanvasProps) => {
  const itemsById = useBoardStore((s) => s.itemsById);
  const items = useMemo(
    () => Object.values(itemsById).sort((a, b) => a.z - b.z),
    [itemsById],
  );
  const upsertItem = useBoardStore((s) => s.upsertItem);
  const removeItem = useBoardStore((s) => s.removeItem);
  const socketStatus = useBoardStore((s) => s.socketStatus);

  const pendingItems = useMemo(
    () =>
      viewerKind === "client"
        ? items.filter((i) => i.approval_status === "pending")
        : [],
    [items, viewerKind],
  );

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const pointersRef = useRef<Map<number, PanPoint>>(new Map());
  const pinchRef = useRef<{
    distance: number;
    startZoom: number;
    startPan: PanPoint;
    center: PanPoint;
  } | null>(null);
  const animateTimeoutRef = useRef<number | null>(null);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  // A just-dropped pin opens its own comment thread immediately — read once
  // by BoardItemView as its initial `commentsOpen` state (see the component's
  // own useState there), so re-renders after the first don't reopen it.
  const [autoOpenCommentsId, setAutoOpenCommentsId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setViewportSize({ width: r.width, height: r.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (animateTimeoutRef.current != null)
        window.clearTimeout(animateTimeoutRef.current);
    },
    [],
  );

  // Clamp the review cursor directly during render (no effect) when the
  // pending list shrinks, same pattern as BoardItem's confirm-reset below.
  const reviewCursor =
    pendingItems.length === 0
      ? 0
      : Math.min(reviewIndex, pendingItems.length - 1);
  if (reviewCursor !== reviewIndex && pendingItems.length > 0) {
    setReviewIndex(reviewCursor);
  }

  const rect = () =>
    surfaceRef.current?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: viewportSize.width,
      height: viewportSize.height,
    };

  const viewportCentre = () => {
    const r = rect();
    return screenToCanvas(
      r.left + r.width / 2,
      r.top + r.height / 2,
      r,
      pan,
      zoom,
    );
  };

  const animateTo = (nextPan: PanPoint, nextZoom: number) => {
    setAnimated(true);
    setPan(nextPan);
    setZoom(nextZoom);
    if (animateTimeoutRef.current != null)
      window.clearTimeout(animateTimeoutRef.current);
    animateTimeoutRef.current = window.setTimeout(
      () => setAnimated(false),
      ANIMATE_MS,
    );
  };

  /** Pans and zooms so `target` fills most of the viewport, and selects it —
   * used by the client's review bar to walk straight to each pending card. */
  const focusItem = (item: BoardItem) => {
    const r = rect();
    const scaleX = (r.width - FOCUS_PADDING * 2) / item.width;
    const scaleY = (r.height - FOCUS_PADDING * 2) / item.height;
    const nextZoom = clamp(Math.min(scaleX, scaleY, 1.5), MIN_ZOOM, MAX_ZOOM);
    const centreX = item.x + item.width / 2;
    const centreY = item.y + item.height / 2;
    animateTo(
      {
        x: r.width / 2 - centreX * nextZoom,
        y: r.height / 2 - centreY * nextZoom,
      },
      nextZoom,
    );
    setSelectedId(item.id);
  };

  const resetView = () => animateTo({ x: 0, y: 0 }, 1);

  const fitToView = () => {
    if (items.length === 0) return resetView();
    const r = rect();
    const minX = Math.min(...items.map((i) => i.x));
    const minY = Math.min(...items.map((i) => i.y));
    const maxX = Math.max(...items.map((i) => i.x + i.width));
    const maxY = Math.max(...items.map((i) => i.y + i.height));
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const scaleX = (r.width - FOCUS_PADDING * 2) / width;
    const scaleY = (r.height - FOCUS_PADDING * 2) / height;
    const nextZoom = clamp(Math.min(scaleX, scaleY), MIN_ZOOM, MAX_ZOOM);
    const centreX = minX + width / 2;
    const centreY = minY + height / 2;
    animateTo(
      {
        x: r.width / 2 - centreX * nextZoom,
        y: r.height / 2 - centreY * nextZoom,
      },
      nextZoom,
    );
  };

  const goToPending = (nextIndex: number) => {
    if (pendingItems.length === 0) return;
    const wrapped =
      ((nextIndex % pendingItems.length) + pendingItems.length) %
      pendingItems.length;
    setReviewIndex(wrapped);
    focusItem(pendingItems[wrapped]);
  };

  const handleMinimapNavigate = (point: PanPoint) => {
    const r = rect();
    setPan({
      x: r.width / 2 - point.x * zoom,
      y: r.height / 2 - point.y * zoom,
    });
  };

  const notify = (message: string) => toast.error(message);

  const handleAddNote = async () => {
    const centre = viewportCentre();
    const input: CreateBoardItemInput = {
      type: "note",
      x: centre.x - DEFAULT_NOTE_WIDTH / 2,
      y: centre.y - DEFAULT_NOTE_HEIGHT / 2,
      width: DEFAULT_NOTE_WIDTH,
      height: DEFAULT_NOTE_HEIGHT,
      content: { text: "" },
      color: DEFAULT_NOTE_COLOR,
    };
    const { item, error } = await actions.create(input);
    if (error || !item) return notify(error ?? "Unable to add the note");
    upsertItem(item);
    setSelectedId(item.id);
  };

  /** Drops a small comment pin at the viewport centre — like a note, it can
   * then be dragged anywhere on the board — and opens its thread right away,
   * since the point of a pin is the conversation anchored to it. */
  const handleAddPin = async () => {
    const centre = viewportCentre();
    const { item, error } = await actions.create({
      type: "pin",
      x: centre.x - PIN_SIZE / 2,
      y: centre.y - PIN_SIZE / 2,
      width: PIN_SIZE,
      height: PIN_SIZE,
      content: {},
    });
    if (error || !item) return notify(error ?? "Unable to add the comment pin");
    upsertItem(item);
    setSelectedId(item.id);
    setAutoOpenCommentsId(item.id);
  };

  const handleFile = async (file: File) => {
    const centre = viewportCentre();
    const dims = await readImageSize(file).catch(() => null);
    let width = IMAGE_TARGET;
    let height = IMAGE_TARGET;
    if (dims) {
      const scale = IMAGE_TARGET / Math.max(dims.width, dims.height);
      width = Math.round(dims.width * scale);
      height = Math.round(dims.height * scale);
    }
    const placement = {
      x: centre.x - width / 2,
      y: centre.y - height / 2,
      width,
      height,
    };
    const pending = toast.loading("Uploading image…");
    const { item, error } = await actions.uploadImage(file, placement);
    toast.dismiss(pending);
    if (error || !item) return notify(error ?? "Unable to upload the image");
    upsertItem(item);
    setSelectedId(item.id);
  };

  const onSurfacePointerDown = (event: React.PointerEvent) => {
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      pinchRef.current = {
        distance: Math.hypot(dx, dy),
        startZoom: zoom,
        startPan: pan,
        center: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
      panRef.current = null;
      return;
    }

    if (
      event.target !== surfaceRef.current &&
      !(event.target as HTMLElement).dataset.surface
    )
      return;
    setSelectedId(null);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    panRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const onSurfacePointerMove = (event: React.PointerEvent) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const distance = Math.hypot(dx, dy);
      if (pinch.distance === 0) return;
      const r = rect();
      const nextZoom = clamp(
        pinch.startZoom * (distance / pinch.distance),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const cursor = {
        x: pinch.center.x - r.left,
        y: pinch.center.y - r.top,
      };
      setPan({
        x: cursor.x - ((cursor.x - pinch.startPan.x) / pinch.startZoom) * nextZoom,
        y: cursor.y - ((cursor.y - pinch.startPan.y) / pinch.startZoom) * nextZoom,
      });
      setZoom(nextZoom);
      return;
    }

    const p = panRef.current;
    if (!p) return;
    setPan({
      x: p.origX + (event.clientX - p.startX),
      y: p.origY + (event.clientY - p.startY),
    });
  };

  const onSurfacePointerUp = (event: React.PointerEvent) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    panRef.current = null;
  };

  const onWheel = (event: React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const r = rect();
      const next = clamp(
        zoom * (event.deltaY < 0 ? 1.1 : 0.9),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      // Keep the point under the cursor fixed while zooming.
      const cursor = {
        x: event.clientX - r.left,
        y: event.clientY - r.top,
      };
      setPan({
        x: cursor.x - ((cursor.x - pan.x) / zoom) * next,
        y: cursor.y - ((cursor.y - pan.y) / zoom) * next,
      });
      setZoom(next);
    } else {
      setPan((prev) => ({
        x: prev.x - event.deltaX,
        y: prev.y - event.deltaY,
      }));
    }
  };

  const stepZoom = (factor: number) => {
    const r = rect();
    const cursor = { x: r.width / 2, y: r.height / 2 };
    const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    animateTo(
      {
        x: cursor.x - ((cursor.x - pan.x) / zoom) * next,
        y: cursor.y - ((cursor.y - pan.y) / zoom) * next,
      },
      next,
    );
  };

  return (
    <div className={styles.wrapper}>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleFile(file);
        }}
      />

      <div
        ref={surfaceRef}
        className={styles.surface}
        data-surface="true"
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        onPointerCancel={onSurfacePointerUp}
        onWheel={onWheel}
      >
        <div
          className={styles.world}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: animated
              ? `transform ${ANIMATE_MS}ms ${"cubic-bezier(0.4, 0, 0.2, 1)"}`
              : undefined,
          }}
        >
          {items.map((item) => (
            <BoardItemView
              key={item.id}
              item={item}
              zoom={zoom}
              selected={selectedId === item.id}
              actions={actions}
              imageUrl={imageUrl}
              currentUserId={currentUserId}
              canModerate={canModerate}
              viewerKind={viewerKind}
              autoOpenComments={autoOpenCommentsId === item.id}
              onSelect={() => setSelectedId(item.id)}
              onError={(message) => {
                notify(message);
                // A failed create/delete may have left a phantom — a resync
                // reconciles, but drop the obvious case now.
                if (!useBoardStore.getState().itemsById[item.id])
                  removeItem(item.id);
              }}
            />
          ))}
        </div>

        {items.length === 0 && (
          <p className={styles.empty} data-surface="true">
            An empty canvas. Add a note or drop an image — everyone on the
            project sees it live.
          </p>
        )}
      </div>

      {viewerKind === "client" && (
        <BoardReviewBar
          pendingItems={pendingItems}
          currentIndex={reviewCursor}
          onPrev={() => goToPending(reviewCursor - 1)}
          onNext={() => goToPending(reviewCursor + 1)}
        />
      )}

      <span
        className={styles.liveChip}
        data-status={socketStatus}
        aria-hidden="true"
      >
        {socketStatus === "open"
          ? "Live"
          : socketStatus === "connecting"
            ? "Connecting…"
            : "Offline"}
      </span>

      <div className={styles.minimapSlot}>
        <BoardMinimap
          items={items}
          pan={pan}
          zoom={zoom}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height}
          onNavigate={handleMinimapNavigate}
        />
      </div>

      <div className={styles.floatingToolbar}>
        <button type="button" className={styles.tool} onClick={handleAddNote}>
          <StickyNote aria-hidden="true" /> Note
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon aria-hidden="true" /> Image
        </button>
        <button type="button" className={styles.tool} onClick={handleAddPin}>
          <MessageSquarePlus aria-hidden="true" /> Comment
        </button>
        <span className={styles.divider} aria-hidden="true" />
        <button
          type="button"
          className={styles.zoomButton}
          onClick={() => stepZoom(0.9)}
          aria-label="Zoom out"
        >
          <Minus aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.zoomLevel}
          onClick={resetView}
          aria-label="Reset zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className={styles.zoomButton}
          onClick={() => stepZoom(1.1)}
          aria-label="Zoom in"
        >
          <Plus aria-hidden="true" />
        </button>
        <span className={styles.divider} aria-hidden="true" />
        <button
          type="button"
          className={styles.zoomButton}
          onClick={fitToView}
          aria-label="Fit all cards in view"
        >
          <Maximize aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

export default BoardCanvas;

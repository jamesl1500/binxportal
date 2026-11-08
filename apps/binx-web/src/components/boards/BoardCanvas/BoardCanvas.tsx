/**
 * BoardCanvas.tsx
 *
 * The project collaboration canvas, Milanote-style: an infinite pan/zoom
 * board the agency team and the client's portal contacts build together in
 * real time. A card rail on the left (drag a tile out, or click it), a
 * breadcrumb bar across the top for nested boards, and the board itself —
 * notes, images, to-do lists backed by real project tasks, links, files,
 * columns that cards stack into, board cards that open sub-boards, and
 * connector lines.
 *
 * Context-agnostic: the staff and portal pages pass their own server actions
 * via `actions` plus URL builders, so one component serves both sides.
 * Live state lives in `useBoardStore`, kept current by `BoardProvider`.
 *
 * Native pointer events only — no DnD library, matching KanbanBoard.tsx. A
 * card move is a canvas-level gesture (window listeners) so the card can
 * leave a column (re-mounting in the world layer) mid-drag; the drop target
 * — a column slot or a board card — is hit-tested from the pointer.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardCanvas.tsx
 * @author Binx Portal
 */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Maximize, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import type { BoardCrumb, BoardItem } from "@/lib/boards-client";
import {
  BOARD_COLORS,
  clamp,
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_NOTE_COLOR,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  PIN_HEIGHT,
  PIN_WIDTH,
  screenToCanvas,
} from "@/lib/boards-client";
import type { CreateBoardItemInput, UploadPlacement } from "@/lib/boards";
import { useBoardStore } from "@/stores/use-board-store";
import BoardItemView from "@/components/boards/BoardCanvas/BoardItem";
import BoardLines, {
  type ConnectPreview,
} from "@/components/boards/BoardCanvas/BoardLines";
import BoardMinimap from "@/components/boards/BoardCanvas/BoardMinimap";
import BoardReviewBar from "@/components/boards/BoardCanvas/BoardReviewBar";
import BoardToolbar, {
  TOOL_MIME,
  type ToolKind,
} from "@/components/boards/BoardCanvas/BoardToolbar";

import {
  BoardCanvasContext,
  type BoardCanvasActions,
  type BoardCanvasContextValue,
  type DropTarget,
} from "./BoardCanvasContext";
import { cardIdAt, dropTargetAt, measuredCanvasRect } from "./canvas-dom";
import styles from "./BoardCanvas.module.scss";

export type { BoardCanvasActions } from "./BoardCanvasContext";

interface BoardCanvasProps {
  actions: BoardCanvasActions;
  imageUrl: (fileId: string) => string;
  /** Download URL for a file card — defaults to `imageUrl` (same proxy). */
  fileUrl?: (fileId: string) => string;
  currentUserId: string;
  /** Agency owner/admin — can delete anyone's comment (moderation). */
  canModerate: boolean;
  /** Who's viewing — decides which approval / to-do controls show. */
  viewerKind: "agency" | "client";
  /** Root → current board. Omitted = a single (root) board. */
  path?: BoardCrumb[];
  /** What the root board is called in the breadcrumbs (the project name). */
  rootTitle?: string;
  /** Link for a breadcrumb (null = the root board). */
  boardHref?: (boardId: string | null) => string;
  /** Navigate into a sub-board (a board card's Open). */
  onOpenBoard?: (boardId: string) => void;
}

const IMAGE_TARGET = 360;
const FOCUS_PADDING = 96;
const ANIMATE_MS = 240;
const DRAG_THRESHOLD = 4;

type PanPoint = { x: number; y: number };

type DragState = {
  item: BoardItem;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  fromColumn: string | null;
  moved: boolean;
  z: number;
};

const BoardCanvas = ({
  actions,
  imageUrl,
  fileUrl,
  currentUserId,
  canModerate,
  viewerKind,
  path,
  rootTitle,
  boardHref,
  onOpenBoard,
}: BoardCanvasProps) => {
  const itemsById = useBoardStore((s) => s.itemsById);
  const sizesById = useBoardStore((s) => s.sizesById);
  const boardId = useBoardStore((s) => s.boardId);
  const items = useMemo(
    () => Object.values(itemsById).sort((a, b) => a.z - b.z),
    [itemsById],
  );
  // Free cards render in the world layer; a card whose column is gone (a
  // race with a delete) falls back to free rather than vanishing.
  const freeItems = useMemo(
    () =>
      items.filter(
        (i) => i.type !== "line" && (!i.parent_id || !itemsById[i.parent_id]),
      ),
    [items, itemsById],
  );
  const lines = useMemo(() => items.filter((i) => i.type === "line"), [items]);
  // What the minimap / fit-to-view measure: free cards at their real size.
  const measured = useMemo(
    () =>
      freeItems.map((i) => ({
        ...i,
        width: sizesById[i.id]?.width ?? i.width,
        height: sizesById[i.id]?.height ?? i.height,
      })),
    [freeItems, sizesById],
  );
  const upsertItem = useBoardStore((s) => s.upsertItem);
  const patchItem = useBoardStore((s) => s.patchItem);
  const removeItem = useBoardStore((s) => s.removeItem);
  const setActive = useBoardStore((s) => s.setActive);
  const socketStatus = useBoardStore((s) => s.socketStatus);

  const pendingItems = useMemo(
    () =>
      viewerKind === "client"
        ? items.filter((i) => i.approval_status === "pending")
        : [],
    [items, viewerKind],
  );
  const subBoardPending = useMemo(
    () =>
      viewerKind === "client"
        ? items.filter((i) => i.type === "board" && (i.pending_count ?? 0) > 0)
        : [],
    [items, viewerKind],
  );

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
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
  const dragRef = useRef<DragState | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const pendingUploadRef = useRef<{ kind: "image" | "file"; at: PanPoint | null; parentId?: string } | null>(null);
  const cascadeRef = useRef(0);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // Window-level gesture listeners read the live pan/zoom through this ref.
  const viewRef = useRef({ pan, zoom });
  useEffect(() => {
    viewRef.current = { pan, zoom };
  }, [pan, zoom]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  // A just-dropped pin opens its own comment thread immediately.
  const [autoOpenCommentsId, setAutoOpenCommentsId] = useState<string | null>(null);
  const [dropTarget, setDropTargetState] = useState<DropTarget | null>(null);
  const [connectPreview, setConnectPreview] = useState<ConnectPreview | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<{ at: PanPoint | null; parentId?: string } | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [fileAccept, setFileAccept] = useState("image/png,image/jpeg,image/webp,image/gif");

  const setDropTarget = (target: DropTarget | null) => {
    const prev = dropTargetRef.current;
    const same =
      prev === target ||
      (prev &&
        target &&
        prev.kind === target.kind &&
        prev.id === target.id &&
        (prev.kind !== "column" || target.kind !== "column" || prev.index === target.index));
    dropTargetRef.current = target;
    if (!same) setDropTargetState(target);
  };

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

  // Clamp the review cursor during render (no effect) when the pending list
  // shrinks, same pattern as BoardItem's confirm-reset.
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

  const toCanvas = (clientX: number, clientY: number) => {
    const { pan: p, zoom: z } = viewRef.current;
    return screenToCanvas(clientX, clientY, rect(), p, z);
  };

  const viewportCentre = () => {
    const r = rect();
    return toCanvas(r.left + r.width / 2, r.top + r.height / 2);
  };

  /** Where a click-to-add card lands: the view centre, nudged a little each
   * time so repeated clicks fan out instead of stacking exactly. */
  const nextSpot = () => {
    const c = viewportCentre();
    const step = (cascadeRef.current++ % 6) * 24;
    return { x: c.x + step, y: c.y + step };
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

  /** Pans and zooms so `item` fills most of the viewport, and selects it —
   * used by the client's review bar to walk straight to each pending card
   * (measured from the DOM, so it works for cards inside a column too). */
  const focusItem = (item: BoardItem) => {
    const box =
      (item.parent_id && measuredCanvasRect(item.id, worldRef.current, zoom)) || {
        x: item.x,
        y: item.y,
        width: sizesById[item.id]?.width ?? item.width,
        height: sizesById[item.id]?.height ?? item.height,
      };
    const r = rect();
    const scaleX = (r.width - FOCUS_PADDING * 2) / box.width;
    const scaleY = (r.height - FOCUS_PADDING * 2) / box.height;
    const nextZoom = clamp(Math.min(scaleX, scaleY, 1.5), MIN_ZOOM, MAX_ZOOM);
    animateTo(
      {
        x: r.width / 2 - (box.x + box.width / 2) * nextZoom,
        y: r.height / 2 - (box.y + box.height / 2) * nextZoom,
      },
      nextZoom,
    );
    setSelectedId(item.id);
  };

  const resetView = () => animateTo({ x: 0, y: 0 }, 1);

  const fitToView = () => {
    if (measured.length === 0) return resetView();
    const r = rect();
    const minX = Math.min(...measured.map((i) => i.x));
    const minY = Math.min(...measured.map((i) => i.y));
    const maxX = Math.max(...measured.map((i) => i.x + i.width));
    const maxY = Math.max(...measured.map((i) => i.y + i.height));
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const nextZoom = clamp(
      Math.min((r.width - FOCUS_PADDING * 2) / width, (r.height - FOCUS_PADDING * 2) / height),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    animateTo(
      {
        x: r.width / 2 - (minX + width / 2) * nextZoom,
        y: r.height / 2 - (minY + height / 2) * nextZoom,
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

  // ---- Adding cards ----

  const created = (item: BoardItem | undefined, error: string | undefined, fallback: string) => {
    if (error || !item) {
      notify(error ?? fallback);
      return null;
    }
    upsertItem(item);
    setSelectedId(item.id);
    return item;
  };

  const createCard = async (input: CreateBoardItemInput, fallback: string) => {
    const { item, error } = await actions.create({
      ...input,
      ...(boardId ? { board_id: boardId } : {}),
    });
    return created(item, error, fallback);
  };

  const uploadFile = async (file: File, at: PanPoint | null, parentId?: string) => {
    const spot = at ?? nextSpot();
    const isImage = file.type.startsWith("image/") && /png|jpe?g|webp|gif/.test(file.type);
    const placement: UploadPlacement = {
      x: spot.x,
      y: spot.y,
      ...(boardId ? { board_id: boardId } : {}),
      ...(parentId ? { parent_id: parentId } : {}),
    };
    if (isImage) {
      const dims = await readImageSize(file).catch(() => null);
      let width = IMAGE_TARGET;
      let height = IMAGE_TARGET;
      if (dims) {
        const scale = IMAGE_TARGET / Math.max(dims.width, dims.height);
        width = Math.round(dims.width * scale);
        height = Math.round(dims.height * scale);
      }
      Object.assign(placement, { x: spot.x - width / 2, y: spot.y - height / 2, width, height });
      const pending = toast.loading("Uploading image…");
      const { item, error } = await actions.uploadImage(file, placement);
      toast.dismiss(pending);
      return created(item, error, "Unable to upload the image");
    }
    if (!actions.uploadFile) return notify("Only images can be added here.");
    const pending = toast.loading("Uploading file…");
    const { item, error } = await actions.uploadFile(file, {
      ...placement,
      x: spot.x - DEFAULT_NOTE_WIDTH / 2,
      y: spot.y - 36,
    });
    toast.dismiss(pending);
    return created(item, error, "Unable to upload the file");
  };

  const addLink = async (url: string, at: PanPoint | null, parentId?: string) => {
    const spot = at ?? nextSpot();
    const pending = toast.loading("Fetching link preview…");
    const item = await createCard(
      {
        type: "link",
        x: spot.x - 140,
        y: spot.y - 60,
        width: 280,
        content: { url },
        ...(parentId ? { parent_id: parentId } : {}),
      },
      "Unable to add the link",
    );
    toast.dismiss(pending);
    return item;
  };

  /** Drop a card of `kind` at `at` (canvas point; null = view centre), or
   * straight into the column `parentId`. */
  const place = async (kind: ToolKind, at: PanPoint | null, parentId?: string) => {
    const spot = at ?? nextSpot();
    const inColumn = parentId ? { parent_id: parentId } : {};
    switch (kind) {
      case "note": {
        const item = await createCard(
          {
            type: "note",
            x: spot.x - DEFAULT_NOTE_WIDTH / 2,
            y: spot.y - DEFAULT_NOTE_HEIGHT / 2,
            width: DEFAULT_NOTE_WIDTH,
            height: DEFAULT_NOTE_HEIGHT,
            content: { text: "" },
            color: DEFAULT_NOTE_COLOR,
            ...inColumn,
          },
          "Unable to add the note",
        );
        if (item) setAutoEditId(item.id);
        return;
      }
      case "todo": {
        const item = await createCard(
          { type: "todo", x: spot.x - 130, y: spot.y - 40, width: 260, content: { title: "" }, ...inColumn },
          "Unable to add the to-do list",
        );
        if (item) setAutoEditId(item.id);
        return;
      }
      case "column": {
        const item = await createCard(
          { type: "column", x: spot.x - DEFAULT_COLUMN_WIDTH / 2, y: spot.y - 60, width: DEFAULT_COLUMN_WIDTH, content: { title: "" } },
          "Unable to add the column",
        );
        if (item) setAutoEditId(item.id);
        return;
      }
      case "board": {
        const item = await createCard(
          {
            type: "board",
            x: spot.x - 120,
            y: spot.y - 40,
            width: 240,
            content: { title: "Untitled board" },
            color: BOARD_COLORS[(cascadeRef.current + items.length) % BOARD_COLORS.length],
            ...inColumn,
          },
          "Unable to add the board",
        );
        if (item) setAutoEditId(item.id);
        return;
      }
      case "line":
        await createCard(
          {
            type: "line",
            x: spot.x - 90,
            y: spot.y,
            content: { from: null, to: null, x1: spot.x - 90, y1: spot.y, x2: spot.x + 90, y2: spot.y, arrow: "end" },
          },
          "Unable to add the line",
        );
        return;
      case "pin": {
        // The pin's tail tip — not its box — marks the spot (see BoardItem).
        const item = await createCard(
          { type: "pin", x: spot.x - PIN_WIDTH / 2, y: spot.y - PIN_HEIGHT, width: PIN_WIDTH, height: PIN_HEIGHT, content: {} },
          "Unable to add the comment pin",
        );
        if (item) setAutoOpenCommentsId(item.id);
        return;
      }
      case "link":
        setLinkDraft("");
        setLinkPrompt({ at, parentId });
        return;
      case "image":
      case "file":
        pendingUploadRef.current = { kind, at, parentId };
        setFileAccept(kind === "image" ? "image/png,image/jpeg,image/webp,image/gif" : "");
        // Let the accept attribute land before opening the picker.
        window.setTimeout(() => fileRef.current?.click(), 0);
        return;
    }
  };

  // ---- Moving cards (canvas-level gesture) ----

  const startDrag = (item: BoardItem, event: React.PointerEvent) => {
    const origin = item.parent_id
      ? measuredCanvasRect(item.id, worldRef.current, viewRef.current.zoom) ?? { x: item.x, y: item.y }
      : { x: item.x, y: item.y };
    const maxZ = Math.max(0, ...Object.values(useBoardStore.getState().itemsById).map((i) => i.z));
    dragRef.current = {
      item,
      startX: event.clientX,
      startY: event.clientY,
      origX: origin.x,
      origY: origin.y,
      fromColumn: item.parent_id ?? null,
      moved: false,
      z: item.z < maxZ ? maxZ + 1 : item.z,
    };

    const onMove = (e: PointerEvent) => {
      const g = dragRef.current;
      if (!g) return;
      const dxScreen = e.clientX - g.startX;
      const dyScreen = e.clientY - g.startY;
      if (!g.moved) {
        if (Math.hypot(dxScreen, dyScreen) < DRAG_THRESHOLD) return;
        g.moved = true;
        setActive(g.item.id, true);
        // Lift it out of its column (locally) so it follows the pointer.
        patchItem(g.item.id, {
          z: g.z,
          ...(g.fromColumn ? { clear_parent: true, x: g.origX, y: g.origY } : {}),
        });
      }
      const z = viewRef.current.zoom;
      patchItem(g.item.id, { x: g.origX + dxScreen / z, y: g.origY + dyScreen / z });
      setDropTarget(dropTargetAt(e.clientX, e.clientY, g.item.id, g.item.type));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const g = dragRef.current;
      dragRef.current = null;
      const target = dropTargetRef.current;
      setDropTarget(null);
      if (!g || !g.moved) return;
      const id = g.item.id;
      const fresh = useBoardStore.getState().itemsById[id];
      const done = (r: { item?: BoardItem; error?: string }) => {
        setActive(id, false);
        if (r.error) {
          notify(r.error);
          upsertItem(g.item); // put it back where it was
          return;
        }
        if (r.item) upsertItem(r.item);
      };
      if (!fresh) return setActive(id, false);

      if (target?.kind === "column" && target.id !== id) {
        // Reorder the destination stack locally; the server confirms.
        const siblings = Object.values(useBoardStore.getState().itemsById)
          .filter((i) => i.parent_id === target.id && i.id !== id)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        siblings.splice(target.index, 0, fresh);
        siblings.forEach((s, i) => patchItem(s.id, { position: i, ...(s.id === id ? { parent_id: target.id } : {}) }));
        void actions.update(id, { parent_id: target.id, position: target.index }).then(done);
        return;
      }
      if (target?.kind === "board" && target.id !== id) {
        removeItem(id);
        setSelectedId(null);
        void actions.update(id, { board_id: target.boardId }).then((r) => {
          setActive(id, false);
          if (r.error) {
            notify(r.error);
            upsertItem(g.item);
            return;
          }
          toast.success("Moved into the board");
        });
        return;
      }
      void actions
        .update(id, {
          x: fresh.x,
          y: fresh.y,
          z: g.z,
          ...(g.fromColumn ? { clear_parent: true } : {}),
        })
        .then(done);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // ---- Drawing a connector out of a card ----

  const startConnect = (item: BoardItem, event: React.PointerEvent) => {
    const fromBox = {
      x: item.x,
      y: item.y,
      width: sizesById[item.id]?.width ?? item.width,
      height: sizesById[item.id]?.height ?? item.height,
    };
    setConnectPreview({ fromId: item.id, to: toCanvas(event.clientX, event.clientY) });
    const onMove = (e: PointerEvent) =>
      setConnectPreview({ fromId: item.id, to: toCanvas(e.clientX, e.clientY) });
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setConnectPreview(null);
      const end = toCanvas(e.clientX, e.clientY);
      const target = cardIdAt(e.clientX, e.clientY, item.id);
      const cx = fromBox.x + fromBox.width / 2;
      const cy = fromBox.y + fromBox.height / 2;
      if (!target && Math.hypot(end.x - cx, end.y - cy) < 40) return; // a click, not a drag
      void createCard(
        {
          type: "line",
          x: Math.min(cx, end.x),
          y: Math.min(cy, end.y),
          content: { from: item.id, to: target, x1: cx, y1: cy, x2: end.x, y2: end.y, arrow: "end" },
        },
        "Unable to add the line",
      );
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // ---- Pan / zoom ----

  const onSurfacePointerDown = (event: React.PointerEvent) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      pinchRef.current = {
        distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        startZoom: zoom,
        startPan: pan,
        center: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      };
      panRef.current = null;
      return;
    }

    const target = event.target as HTMLElement;
    if (target !== surfaceRef.current && !target.dataset.surface && target !== worldRef.current) return;
    setSelectedId(null);
    target.setPointerCapture(event.pointerId);
    panRef.current = { startX: event.clientX, startY: event.clientY, origX: pan.x, origY: pan.y };
  };

  const onSurfacePointerMove = (event: React.PointerEvent) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch.distance === 0) return;
      const r = rect();
      const nextZoom = clamp(pinch.startZoom * (distance / pinch.distance), MIN_ZOOM, MAX_ZOOM);
      const cursor = { x: pinch.center.x - r.left, y: pinch.center.y - r.top };
      setPan({
        x: cursor.x - ((cursor.x - pinch.startPan.x) / pinch.startZoom) * nextZoom,
        y: cursor.y - ((cursor.y - pinch.startPan.y) / pinch.startZoom) * nextZoom,
      });
      setZoom(nextZoom);
      return;
    }

    const p = panRef.current;
    if (!p) return;
    setPan({ x: p.origX + (event.clientX - p.startX), y: p.origY + (event.clientY - p.startY) });
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
      const next = clamp(zoom * (event.deltaY < 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM);
      // Keep the point under the cursor fixed while zooming.
      const cursor = { x: event.clientX - r.left, y: event.clientY - r.top };
      setPan({
        x: cursor.x - ((cursor.x - pan.x) / zoom) * next,
        y: cursor.y - ((cursor.y - pan.y) / zoom) * next,
      });
      setZoom(next);
    } else {
      setPan((prev) => ({ x: prev.x - event.deltaX, y: prev.y - event.deltaY }));
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

  // ---- Drop from the rail / desktop, paste ----

  const columnAt = (clientX: number, clientY: number): string | undefined => {
    const target = dropTargetAt(clientX, clientY, "__new__", "note");
    return target?.kind === "column" ? target.id : undefined;
  };

  const onDragOver = (event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer.types);
    if (types.includes(TOOL_MIME) || types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const onDrop = (event: React.DragEvent) => {
    const kind = event.dataTransfer.getData(TOOL_MIME) as ToolKind | "";
    const at = toCanvas(event.clientX, event.clientY);
    const parentId = columnAt(event.clientX, event.clientY);
    if (kind) {
      event.preventDefault();
      void place(kind, at, kind === "column" || kind === "line" || kind === "pin" ? undefined : parentId);
      return;
    }
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) {
      event.preventDefault();
      void (async () => {
        for (const [i, file] of files.entries()) {
          await uploadFile(file, { x: at.x + i * 24, y: at.y + i * 24 }, parentId);
        }
      })();
    }
  };

  // Paste a URL → link card; paste an image → image card (Milanote does both).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (!surfaceRef.current?.isConnected) return;
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (file) {
        event.preventDefault();
        void uploadFile(file, null);
        return;
      }
      const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
      if (/^https?:\/\/\S+$/i.test(text)) {
        event.preventDefault();
        void addLink(text, null);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ctx: BoardCanvasContextValue = {
    actions,
    imageUrl,
    fileUrl: fileUrl ?? imageUrl,
    currentUserId,
    canModerate,
    viewerKind,
    zoom,
    selectedId,
    select: setSelectedId,
    startDrag,
    startConnect,
    dropTarget,
    autoEditId,
    autoOpenCommentsId,
    openBoard: (id) => onOpenBoard?.(id),
    onError: (message) => {
      notify(message);
    },
  };

  const crumbs = path && path.length > 0 ? path : null;

  return (
    <BoardCanvasContext.Provider value={ctx}>
      <div className={styles.wrapper}>
        <input
          ref={fileRef}
          type="file"
          accept={fileAccept || undefined}
          hidden
          data-testid="board-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            const pending = pendingUploadRef.current;
            pendingUploadRef.current = null;
            if (file) void uploadFile(file, pending?.at ?? null, pending?.parentId);
          }}
        />

        <header className={styles.topBar}>
          <nav className={styles.crumbs} aria-label="Board">
            {crumbs ? (
              crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                const label = (i === 0 ? rootTitle : crumb.title) || (i === 0 ? "Canvas" : "Untitled board");
                return (
                  <span key={crumb.id} className={styles.crumb}>
                    {i > 0 && <ChevronRight aria-hidden="true" className={styles.crumbSep} />}
                    {last || !boardHref ? (
                      <span aria-current={last ? "page" : undefined} className={styles.crumbCurrent}>
                        {label}
                      </span>
                    ) : (
                      <Link href={boardHref(i === 0 ? null : crumb.id)} className={styles.crumbLink}>
                        {label}
                      </Link>
                    )}
                  </span>
                );
              })
            ) : (
              <span className={styles.crumbCurrent}>{rootTitle || "Canvas"}</span>
            )}
          </nav>
          <div className={styles.topActions}>
            <span className={styles.liveChip} data-status={socketStatus} aria-hidden="true">
              {socketStatus === "open" ? "Live" : socketStatus === "connecting" ? "Connecting…" : "Offline"}
            </span>
            <span className={styles.zoomGroup}>
              <button type="button" className={styles.zoomButton} onClick={() => stepZoom(0.9)} aria-label="Zoom out">
                <Minus aria-hidden="true" />
              </button>
              <button type="button" className={styles.zoomLevel} onClick={resetView} aria-label="Reset zoom to 100%">
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" className={styles.zoomButton} onClick={() => stepZoom(1.1)} aria-label="Zoom in">
                <Plus aria-hidden="true" />
              </button>
              <button type="button" className={styles.zoomButton} onClick={fitToView} aria-label="Fit all cards in view">
                <Maximize aria-hidden="true" />
              </button>
            </span>
          </div>
        </header>

        <div className={styles.body}>
          <BoardToolbar
            viewerKind={viewerKind}
            canUploadFiles={Boolean(actions.uploadFile)}
            onPick={(kind) => void place(kind, null)}
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
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <div
              ref={worldRef}
              className={styles.world}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: animated ? `transform ${ANIMATE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : undefined,
              }}
            >
              <BoardLines lines={lines} toCanvas={toCanvas} preview={connectPreview} />
              {freeItems.map((item) => (
                <BoardItemView key={item.id} item={item} />
              ))}
            </div>

            {items.length === 0 && (
              <p className={styles.empty} data-surface="true">
                An empty canvas. Drag a card in from the left — notes, to-dos,
                links, columns, boards — or drop files here. Everyone on the
                project sees it live.
              </p>
            )}

            {linkPrompt && (
              <form
                className={styles.linkPrompt}
                onPointerDown={(e) => e.stopPropagation()}
                onSubmit={(e) => {
                  e.preventDefault();
                  const url = linkDraft.trim();
                  const prompt = linkPrompt;
                  setLinkPrompt(null);
                  if (url) void addLink(url, prompt.at, prompt.parentId);
                }}
              >
                <label htmlFor="board-link-input">Paste a link</label>
                <input
                  id="board-link-input"
                  autoFocus
                  value={linkDraft}
                  placeholder="https://"
                  onChange={(e) => setLinkDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setLinkPrompt(null);
                  }}
                />
                <button type="submit">Add</button>
                <button type="button" data-tone="ghost" onClick={() => setLinkPrompt(null)}>
                  Cancel
                </button>
              </form>
            )}
          </div>

          {viewerKind === "client" && (
            <BoardReviewBar
              pendingItems={pendingItems}
              currentIndex={reviewCursor}
              onPrev={() => goToPending(reviewCursor - 1)}
              onNext={() => goToPending(reviewCursor + 1)}
              subBoards={subBoardPending.map((b) => ({
                id: b.id,
                title: String((b.content as { title?: string }).title ?? "Untitled board"),
                count: b.pending_count ?? 0,
                boardId: String((b.content as { board_id?: string }).board_id ?? ""),
              }))}
              onOpenBoard={(id) => onOpenBoard?.(id)}
            />
          )}

          <div className={styles.minimapSlot}>
            <BoardMinimap
              items={measured}
              pan={pan}
              zoom={zoom}
              viewportWidth={viewportSize.width}
              viewportHeight={viewportSize.height}
              onNavigate={handleMinimapNavigate}
            />
          </div>
        </div>
      </div>
    </BoardCanvasContext.Provider>
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

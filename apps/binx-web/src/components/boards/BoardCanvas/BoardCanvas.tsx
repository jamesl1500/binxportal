/**
 * BoardCanvas.tsx
 *
 * The project collaboration canvas — an infinite, pan/zoom surface of freely
 * positioned cards (notes + images) that the agency team and the client's
 * portal contacts edit together in real time. Context-agnostic: the staff and
 * portal pages pass in their own server actions via the `actions` prop and an
 * `imageUrl` builder, so one component serves both.
 *
 * Native pointer events only — no DnD library, matching KanbanBoard.tsx.
 * Live state lives in `useBoardStore`, kept current by `BoardProvider`.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardCanvas.tsx
 * @author Binx.io
 */
"use client";

import { useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Minus, Plus, StickyNote } from "lucide-react";
import { toast } from "sonner";

import type { BoardComment, BoardItem, BoardItemPatch } from "@/lib/boards-client";
import {
  clamp,
  DEFAULT_NOTE_COLOR,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToCanvas,
} from "@/lib/boards-client";
import type { BoardReactions, CreateBoardItemInput } from "@/lib/boards";
import { useBoardStore } from "@/stores/use-board-store";
import BoardItemView from "@/components/boards/BoardCanvas/BoardItem";

import styles from "./BoardCanvas.module.scss";

export interface BoardCanvasActions {
  create: (input: CreateBoardItemInput) => Promise<{ item?: BoardItem; error?: string }>;
  update: (id: string, patch: BoardItemPatch) => Promise<{ item?: BoardItem; error?: string }>;
  remove: (id: string) => Promise<{ error?: string }>;
  uploadImage: (
    file: File,
    placement: { x: number; y: number; width?: number; height?: number },
  ) => Promise<{ item?: BoardItem; error?: string }>;
  toggleReaction: (id: string, kind: string) => Promise<{ result?: BoardReactions; error?: string }>;
  listComments: (id: string) => Promise<{ comments?: BoardComment[]; error?: string }>;
  addComment: (id: string, body: string) => Promise<{ comment?: BoardComment; error?: string }>;
  deleteComment: (id: string, commentId: string) => Promise<{ error?: string }>;
}

interface BoardCanvasProps {
  actions: BoardCanvasActions;
  imageUrl: (fileId: string) => string;
  currentUserId: string;
  /** Agency owner/admin — can delete anyone's comment (moderation). */
  canModerate: boolean;
}

const IMAGE_TARGET = 360;

const BoardCanvas = ({ actions, imageUrl, currentUserId, canModerate }: BoardCanvasProps) => {
  const itemsById = useBoardStore((s) => s.itemsById);
  const items = useMemo(
    () => Object.values(itemsById).sort((a, b) => a.z - b.z),
    [itemsById],
  );
  const upsertItem = useBoardStore((s) => s.upsertItem);
  const removeItem = useBoardStore((s) => s.removeItem);
  const socketStatus = useBoardStore((s) => s.socketStatus);

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const panRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const viewportCentre = () => {
    const rect = surfaceRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 800, height: 600 };
    return screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2, rect, pan, zoom);
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
    const placement = { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
    const pending = toast.loading("Uploading image…");
    const { item, error } = await actions.uploadImage(file, placement);
    toast.dismiss(pending);
    if (error || !item) return notify(error ?? "Unable to upload the image");
    upsertItem(item);
    setSelectedId(item.id);
  };

  const onSurfacePointerDown = (event: React.PointerEvent) => {
    if (event.target !== surfaceRef.current && !(event.target as HTMLElement).dataset.surface) return;
    setSelectedId(null);
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    panRef.current = { startX: event.clientX, startY: event.clientY, origX: pan.x, origY: pan.y };
  };

  const onSurfacePointerMove = (event: React.PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    setPan({ x: p.origX + (event.clientX - p.startX), y: p.origY + (event.clientY - p.startY) });
  };

  const onSurfacePointerUp = () => {
    panRef.current = null;
  };

  const onWheel = (event: React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const rect = surfaceRef.current!.getBoundingClientRect();
      const next = clamp(zoom * (event.deltaY < 0 ? 1.1 : 0.9), MIN_ZOOM, MAX_ZOOM);
      // Keep the point under the cursor fixed while zooming.
      const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setPan({
        x: cursor.x - ((cursor.x - pan.x) / zoom) * next,
        y: cursor.y - ((cursor.y - pan.y) / zoom) * next,
      });
      setZoom(next);
    } else {
      setPan((prev) => ({ x: prev.x - event.deltaX, y: prev.y - event.deltaY }));
    }
  };

  const stepZoom = (factor: number) => setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.tool} onClick={handleAddNote}>
          <StickyNote aria-hidden="true" /> Note
        </button>
        <button type="button" className={styles.tool} onClick={() => fileRef.current?.click()}>
          <ImageIcon aria-hidden="true" /> Image
        </button>
        <span className={styles.divider} aria-hidden="true" />
        <button type="button" className={styles.zoomButton} onClick={() => stepZoom(0.9)} aria-label="Zoom out">
          <Minus aria-hidden="true" />
        </button>
        <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
        <button type="button" className={styles.zoomButton} onClick={() => stepZoom(1.1)} aria-label="Zoom in">
          <Plus aria-hidden="true" />
        </button>
        <span className={styles.status} data-status={socketStatus}>
          {socketStatus === "open" ? "Live" : socketStatus === "connecting" ? "Connecting…" : "Offline"}
        </span>
      </div>

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
        onWheel={onWheel}
      >
        <div
          className={styles.world}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
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
              onSelect={() => setSelectedId(item.id)}
              onError={(message) => {
                notify(message);
                // A failed create/delete may have left a phantom — a resync
                // reconciles, but drop the obvious case now.
                if (!useBoardStore.getState().itemsById[item.id]) removeItem(item.id);
              }}
            />
          ))}
        </div>

        {items.length === 0 && (
          <p className={styles.empty} data-surface="true">
            An empty canvas. Add a note or drop an image — everyone on the project sees it live.
          </p>
        )}
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

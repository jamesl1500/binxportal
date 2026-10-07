/**
 * BoardMinimap.tsx
 *
 * A small Miro-style overview pinned to the canvas corner: every card's
 * position at a glance, plus a rectangle showing what the main viewport
 * currently sees. Click or drag anywhere on it to jump the viewport there
 * without losing the current zoom level.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardMinimap.tsx
 * @author Binx Portal
 */
"use client";

import { useMemo, useRef, useState } from "react";

import type { BoardItem } from "@/lib/boards-client";

import styles from "./BoardMinimap.module.scss";

interface BoardMinimapProps {
  items: BoardItem[];
  pan: { x: number; y: number };
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  onNavigate: (canvasPoint: { x: number; y: number }) => void;
}

const MAP_WIDTH = 176;
const MAP_HEIGHT = 128;
const PADDING = 160;

const BoardMinimap = ({
  items,
  pan,
  zoom,
  viewportWidth,
  viewportHeight,
  onNavigate,
}: BoardMinimapProps) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  // State, not a ref: `bounds` below reads it during render (refs can't be
  // read there), and flipping it needs to reliably re-render at both drag
  // start and drag end.
  const [dragging, setDragging] = useState(false);
  const [frozenBounds, setFrozenBounds] = useState<{
    minX: number;
    minY: number;
    width: number;
    height: number;
  } | null>(null);

  const viewMinX = -pan.x / zoom;
  const viewMinY = -pan.y / zoom;
  const viewMaxX = viewMinX + viewportWidth / zoom;
  const viewMaxY = viewMinY + viewportHeight / zoom;

  const liveBounds = useMemo(() => {
    const xs = items.flatMap((i) => [i.x, i.x + i.width]);
    const ys = items.flatMap((i) => [i.y, i.y + i.height]);
    const minX = Math.min(viewMinX, ...(xs.length ? xs : [0])) - PADDING;
    const minY = Math.min(viewMinY, ...(ys.length ? ys : [0])) - PADDING;
    const maxX = Math.max(viewMaxX, ...(xs.length ? xs : [1200])) + PADDING;
    const maxY = Math.max(viewMaxY, ...(ys.length ? ys : [900])) + PADDING;
    return {
      minX,
      minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    };
  }, [items, viewMinX, viewMinY, viewMaxX, viewMaxY]);

  // `liveBounds` grows to keep the viewport rectangle inside it, so it
  // shifts every time the viewport pans. During a drag, dragging the
  // viewport *is* what changes the viewport — recomputing bounds (and so
  // the map's px-to-canvas scale) on every pointer move made the mapping
  // drift under the cursor, which is what made a slow, deliberate drag
  // "fly" past the intended spot. Freeze the bounds at drag start instead,
  // and only pick the fresh ones back up once the drag ends.
  const bounds = dragging && frozenBounds ? frozenBounds : liveBounds;

  const scale = Math.min(MAP_WIDTH / bounds.width, MAP_HEIGHT / bounds.height);

  const toMap = (x: number, y: number) => ({
    left: (x - bounds.minX) * scale,
    top: (y - bounds.minY) * scale,
  });

  const navigateFromEvent = (event: { clientX: number; clientY: number }) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    onNavigate({
      x: (event.clientX - rect.left) / scale + bounds.minX,
      y: (event.clientY - rect.top) / scale + bounds.minY,
    });
  };

  const viewport = toMap(viewMinX, viewMinY);

  return (
    <div
      ref={mapRef}
      className={styles.minimap}
      style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
      onPointerDown={(event) => {
        event.stopPropagation();
        setFrozenBounds(liveBounds);
        setDragging(true);
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        navigateFromEvent(event);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        navigateFromEvent(event);
      }}
      onPointerUp={() => {
        setDragging(false);
        setFrozenBounds(null);
      }}
      role="button"
      tabIndex={0}
      aria-label="Canvas overview — click to jump to a spot"
    >
      {items.map((item) => {
        const pos = toMap(item.x, item.y);
        return (
          <span
            key={item.id}
            className={styles.dot}
            data-author={item.author_kind}
            style={{
              left: pos.left,
              top: pos.top,
              width: Math.max(item.width * scale, 3),
              height: Math.max(item.height * scale, 3),
            }}
          />
        );
      })}
      <div
        className={styles.viewport}
        style={{
          left: viewport.left,
          top: viewport.top,
          width: (viewportWidth / zoom) * scale,
          height: (viewportHeight / zoom) * scale,
        }}
      />
    </div>
  );
};

export default BoardMinimap;

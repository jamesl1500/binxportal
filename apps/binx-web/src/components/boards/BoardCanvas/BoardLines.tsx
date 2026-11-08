/**
 * BoardLines.tsx
 *
 * Milanote's connector lines: an SVG layer under the cards drawing each
 * "line" item from card edge to card edge (or to a free point), with
 * optional arrowheads. A selected line shows draggable end handles — drop
 * an end on a card to attach it, on empty board to leave it free — and a
 * small toolbar for the arrow style and delete. Also draws the live preview
 * while a new connection is being dragged out of a card.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardLines.tsx
 * @author Binx Portal
 */
"use client";

import { useId, useRef } from "react";
import { ArrowRight, ArrowLeftRight, Minus, Trash2 } from "lucide-react";

import {
  edgePoint,
  lineContent,
  type BoardItem,
  type LineArrow,
  type LineContent,
} from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";

import { useBoardCanvas } from "./BoardCanvasContext";
import { cardIdAt } from "./canvas-dom";
import styles from "./BoardCanvas.module.scss";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

export interface ConnectPreview {
  fromId: string;
  to: Point;
}

interface BoardLinesProps {
  lines: BoardItem[];
  toCanvas: (clientX: number, clientY: number) => Point;
  preview: ConnectPreview | null;
}

const LINE_COLOR = "#64748b";
const ARROW_CYCLE: LineArrow[] = ["end", "both", "none"];

export function useRectOf(): (id: string | null) => Rect | null {
  const itemsById = useBoardStore((s) => s.itemsById);
  const sizesById = useBoardStore((s) => s.sizesById);
  return (id) => {
    if (!id) return null;
    let item = itemsById[id];
    if (!item) return null;
    if (item.parent_id && itemsById[item.parent_id]) item = itemsById[item.parent_id];
    const size = sizesById[item.id];
    return {
      x: item.x,
      y: item.y,
      width: size?.width ?? item.width,
      height: size?.height ?? item.height,
    };
  };
}

function centre(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Resolve a line's drawn endpoints: attached ends meet the card's border on
 * the side facing the other end; free ends use their stored point. */
export function resolveEnds(
  c: LineContent,
  rectOf: (id: string | null) => Rect | null,
): { p1: Point; p2: Point } {
  const r1 = rectOf(c.from);
  const r2 = rectOf(c.to);
  const raw1 = r1 ? centre(r1) : { x: c.x1, y: c.y1 };
  const raw2 = r2 ? centre(r2) : { x: c.x2, y: c.y2 };
  return {
    p1: r1 ? edgePoint(r1, raw2) : raw1,
    p2: r2 ? edgePoint(r2, raw1) : raw2,
  };
}

const BoardLines = ({ lines, toCanvas, preview }: BoardLinesProps) => {
  const { actions, selectedId, select, onError } = useBoardCanvas();
  const patchItem = useBoardStore((s) => s.patchItem);
  const removeItem = useBoardStore((s) => s.removeItem);
  const upsertItem = useBoardStore((s) => s.upsertItem);
  const setActive = useBoardStore((s) => s.setActive);
  const rectOf = useRectOf();
  const uid = useId().replace(/:/g, "");
  const dragRef = useRef<{
    line: BoardItem;
    mode: "start" | "end" | "body";
    origin: Point;
    content: LineContent;
  } | null>(null);

  const persist = (line: BoardItem, content: LineContent) => {
    void actions.update(line.id, { content: { ...content } }).then((r) => {
      if (r.error) return onError(r.error);
      if (r.item) upsertItem(r.item);
    });
  };

  const beginDrag = (
    line: BoardItem,
    mode: "start" | "end" | "body",
    event: React.PointerEvent,
  ) => {
    event.stopPropagation();
    select(line.id);
    const content = lineContent(line);
    if (mode === "body" && (content.from || content.to)) return; // attached lines move with their cards
    const { p1, p2 } = resolveEnds(content, rectOf);
    // Freeze the drawn geometry so a detaching end starts where it was seen.
    const frozen: LineContent = { ...content, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    dragRef.current = { line, mode, origin: toCanvas(event.clientX, event.clientY), content: frozen };
    setActive(line.id, true);

    const onMove = (e: PointerEvent) => {
      const g = dragRef.current;
      if (!g) return;
      const p = toCanvas(e.clientX, e.clientY);
      let next: LineContent;
      if (g.mode === "body") {
        const dx = p.x - g.origin.x;
        const dy = p.y - g.origin.y;
        next = { ...g.content, x1: g.content.x1 + dx, y1: g.content.y1 + dy, x2: g.content.x2 + dx, y2: g.content.y2 + dy };
      } else if (g.mode === "start") {
        next = { ...g.content, from: null, x1: p.x, y1: p.y };
      } else {
        next = { ...g.content, to: null, x2: p.x, y2: p.y };
      }
      patchItem(g.line.id, { content: next });
    };
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const g = dragRef.current;
      dragRef.current = null;
      if (!g) return;
      setActive(g.line.id, false);
      const fresh = useBoardStore.getState().itemsById[g.line.id];
      if (!fresh) return;
      const next = lineContent(fresh);
      if (g.mode !== "body") {
        const target = cardIdAt(e.clientX, e.clientY);
        const other = g.mode === "start" ? next.to : next.from;
        if (target && target !== other) {
          if (g.mode === "start") next.from = target;
          else next.to = target;
          patchItem(g.line.id, { content: next });
        }
      }
      persist(fresh, next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const setArrow = (line: BoardItem) => {
    const c = lineContent(line);
    const next = { ...c, arrow: ARROW_CYCLE[(ARROW_CYCLE.indexOf(c.arrow) + 1) % ARROW_CYCLE.length] };
    patchItem(line.id, { content: next });
    persist(line, next);
  };

  const remove = (line: BoardItem) => {
    removeItem(line.id);
    select(null);
    void actions.remove(line.id).then((r) => {
      if (r.error) {
        upsertItem(line);
        onError(r.error);
      }
    });
  };

  const selectedLine = lines.find((l) => l.id === selectedId) ?? null;
  const selectedEnds = selectedLine ? resolveEnds(lineContent(selectedLine), rectOf) : null;
  const previewFrom = preview ? rectOf(preview.fromId) : null;

  return (
    <>
      <svg className={styles.lines} width="1" height="1" aria-hidden="true">
        {lines.map((line) => {
          const c = lineContent(line);
          const { p1, p2 } = resolveEnds(c, rectOf);
          const color = line.color ?? LINE_COLOR;
          const marker = `${uid}-${line.id}`;
          return (
            <g key={line.id} data-selected={line.id === selectedId}>
              <defs>
                <marker
                  id={marker}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill={color} />
                </marker>
              </defs>
              <line
                className={styles.lineHit}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                onPointerDown={(e) => beginDrag(line, "body", e)}
              />
              <line
                className={styles.lineStroke}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={color}
                markerEnd={c.arrow !== "none" ? `url(#${marker})` : undefined}
                markerStart={c.arrow === "both" ? `url(#${marker})` : undefined}
              />
            </g>
          );
        })}
        {preview && previewFrom && (
          <line
            className={styles.linePreview}
            x1={edgePoint(previewFrom, preview.to).x}
            y1={edgePoint(previewFrom, preview.to).y}
            x2={preview.to.x}
            y2={preview.to.y}
          />
        )}
      </svg>

      {selectedLine && selectedEnds && (
        <>
          <span
            className={styles.lineHandle}
            style={{ left: selectedEnds.p1.x, top: selectedEnds.p1.y }}
            onPointerDown={(e) => beginDrag(selectedLine, "start", e)}
            aria-hidden="true"
          />
          <span
            className={styles.lineHandle}
            style={{ left: selectedEnds.p2.x, top: selectedEnds.p2.y }}
            onPointerDown={(e) => beginDrag(selectedLine, "end", e)}
            aria-hidden="true"
          />
          <div
            className={styles.lineBar}
            style={{
              left: (selectedEnds.p1.x + selectedEnds.p2.x) / 2,
              top: (selectedEnds.p1.y + selectedEnds.p2.y) / 2,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.zoomButton}
              onClick={() => setArrow(selectedLine)}
              aria-label="Change arrow style"
              title="Arrow style"
            >
              {lineContent(selectedLine).arrow === "end" ? (
                <ArrowRight aria-hidden="true" />
              ) : lineContent(selectedLine).arrow === "both" ? (
                <ArrowLeftRight aria-hidden="true" />
              ) : (
                <Minus aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className={styles.itemDelete}
              onClick={() => remove(selectedLine)}
              aria-label="Delete line"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </>
  );
};

export default BoardLines;

/**
 * canvas-dom.ts
 *
 * DOM hit-testing for the canvas's pointer gestures: which card, column or
 * board card sits under the pointer. Uses `document.elementsFromPoint`
 * (absent in jsdom — every helper degrades to "nothing there").
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/canvas-dom.ts
 * @author Binx Portal
 */

import {
  COLUMN_CHILD_TYPES,
  type BoardItemType,
} from "@/lib/boards-client";

import type { DropTarget } from "./BoardCanvasContext";

function elementsAt(x: number, y: number): Element[] {
  if (typeof document === "undefined" || typeof document.elementsFromPoint !== "function")
    return [];
  return document.elementsFromPoint(x, y);
}

function cardElement(id: string): Element | null {
  return document.querySelector(`[data-item-id="${id}"]`);
}

/** The card a connector end should attach to under the pointer — a card in
 * a column resolves to its column (lines anchor to free cards only). */
export function cardIdAt(x: number, y: number, excludeId?: string): string | null {
  const excluded = excludeId ? cardElement(excludeId) : null;
  for (const el of elementsAt(x, y)) {
    if (excluded && excluded.contains(el)) continue;
    let card = el.closest<HTMLElement>("[data-item-id]");
    if (!card || card.dataset.type === "line" || card.dataset.type === "pin") continue;
    if (card.dataset.columnChild) {
      card = card.parentElement?.closest<HTMLElement>('[data-item-id][data-type="column"]') ?? null;
    }
    if (card?.dataset.itemId && card.dataset.itemId !== excludeId) return card.dataset.itemId;
  }
  return null;
}

/** Where a dragged card would land: a column (and the index in its stack)
 * or a board card (moving it into that sub-board). */
export function dropTargetAt(
  x: number,
  y: number,
  draggedId: string,
  draggedType: BoardItemType,
): DropTarget | null {
  const dragged = cardElement(draggedId);
  for (const el of elementsAt(x, y)) {
    if (dragged && dragged.contains(el)) continue;
    const boardCard = el.closest<HTMLElement>("[data-drop-board]");
    if (
      boardCard?.dataset.itemId &&
      boardCard.dataset.dropBoard &&
      draggedType !== "line" &&
      draggedType !== "pin"
    ) {
      return { kind: "board", id: boardCard.dataset.itemId, boardId: boardCard.dataset.dropBoard };
    }
    const column = el.closest<HTMLElement>("[data-drop-column]");
    if (column?.dataset.itemId && COLUMN_CHILD_TYPES.has(draggedType)) {
      const body = column.querySelector("[data-column-body]");
      const children = body
        ? Array.from(body.querySelectorAll<HTMLElement>(":scope > [data-column-child]"))
        : [];
      const index = children.filter((child) => {
        const r = child.getBoundingClientRect();
        return r.top + r.height / 2 < y;
      }).length;
      return { kind: "column", id: column.dataset.itemId, index };
    }
  }
  return null;
}

/** A card's box in canvas units, measured from the DOM — needed for a card
 * inside a column, whose own x/y don't describe where it's drawn. */
export function measuredCanvasRect(
  id: string,
  world: HTMLElement | null,
  zoom: number,
): { x: number; y: number; width: number; height: number } | null {
  const el = cardElement(id);
  if (!el || !world) return null;
  const r = el.getBoundingClientRect();
  const w = world.getBoundingClientRect();
  return {
    x: (r.left - w.left) / zoom,
    y: (r.top - w.top) / zoom,
    width: r.width / zoom,
    height: r.height / zoom,
  };
}

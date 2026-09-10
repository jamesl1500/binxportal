/**
 * boards-client.ts
 *
 * Client-safe slice of the collaboration-canvas data layer: the item types,
 * the realtime event shape, geometry helpers, and constants. No `next/headers`,
 * so the canvas components (which render in the browser) import this directly.
 * Sibling to `lib/messaging-client.ts`.
 *
 * @module apps/binx-web/src/lib/boards-client.ts
 * @author Binx.io
 */

/** Keep in sync with binx-api's boards/models.py BOARD_ITEM_TYPES. */
export type BoardItemType = "note" | "image";

export interface NoteContent {
  text: string;
}
export interface ImageContent {
  file_id: string;
  file_name?: string;
}
export type BoardItemContent = NoteContent | ImageContent | Record<string, never>;

export interface BoardItem {
  id: string;
  board_id: string;
  type: BoardItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  content: BoardItemContent;
  color: string | null;
  author_kind: "agency" | "client";
  created_by_id: string | null;
  created_by_name: string;
  /** {emoji: count}. The realtime item events omit these — the store keeps them. */
  reactions: Record<string, number>;
  /** Which reaction kinds the current viewer has on this card. */
  my_reactions: string[];
  comment_count: number;
}

export interface BoardComment {
  id: string;
  item_id: string;
  author_kind: "agency" | "client";
  author_user_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

/** The fixed reaction set — keep in sync with binx-api's REACTION_KINDS. */
export const REACTION_EMOJI: string[] = ["👍", "❤️", "🎉", "👀", "🚀"];

export interface Board {
  board_id: string;
  items: BoardItem[];
}

/** A patch the canvas sends on drag / resize / edit — every field optional. */
export interface BoardItemPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
  content?: BoardItemContent;
  color?: string | null;
  clear_color?: boolean;
}

/** The realtime events binx-api pushes over the shared websocket. */
export type BoardEvent =
  | { type: "board.item.created"; board_id: string; data: BoardItem }
  | { type: "board.item.updated"; board_id: string; data: BoardItem }
  | { type: "board.item.deleted"; board_id: string; data: { id: string } }
  | {
      type: "board.item.reaction";
      board_id: string;
      data: { item_id: string; user_id: string; kind: string; added: boolean; reactions: Record<string, number> };
    }
  | { type: "board.comment.created"; board_id: string; data: BoardComment }
  | { type: "board.comment.deleted"; board_id: string; data: { id: string; item_id: string } };

export const BOARD_EVENT_TYPES = new Set([
  "board.item.created",
  "board.item.updated",
  "board.item.deleted",
  "board.item.reaction",
  "board.comment.created",
  "board.comment.deleted",
]);

// Geometry (canvas units == CSS px at zoom 1). Mirrors boards/service.py.
export const MIN_ITEM_SIZE = 60;
export const MAX_ITEM_SIZE = 4000;
export const DEFAULT_NOTE_WIDTH = 220;
export const DEFAULT_NOTE_HEIGHT = 160;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

/** The note background swatches offered in the card's colour row. */
export const NOTE_COLORS: string[] = [
  "#fef9c3", // yellow
  "#dbeafe", // blue
  "#dcfce7", // green
  "#fce7f3", // pink
  "#ede9fe", // purple
  "#f1f5f9", // slate
];
export const DEFAULT_NOTE_COLOR = NOTE_COLORS[0];

export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Screen (client) point → canvas coordinates, given the current pan/zoom. */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  rect: { left: number; top: number },
  pan: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  return {
    x: (screenX - rect.left - pan.x) / zoom,
    y: (screenY - rect.top - pan.y) / zoom,
  };
}

export function noteText(item: BoardItem): string {
  return item.type === "note" ? String((item.content as NoteContent).text ?? "") : "";
}

export function imageFileId(item: BoardItem): string | null {
  return item.type === "image" ? ((item.content as ImageContent).file_id ?? null) : null;
}

/**
 * boards-client.ts
 *
 * Client-safe slice of the collaboration-canvas data layer: the item types,
 * the realtime event shape, geometry helpers, and constants. No `next/headers`,
 * so the canvas components (which render in the browser) import this directly.
 * Sibling to `lib/messaging-client.ts`.
 *
 * The canvas is Milanote-style: a tree of boards (a "board" card opens a
 * nested board), columns that cards stack into, connector lines, link and
 * file cards, and to-do cards whose rows are real project tasks.
 *
 * @module apps/binx-web/src/lib/boards-client.ts
 * @author Binx Portal
 */

import type { Schemas } from "@/lib/api-types";

/** Keep in sync with binx-api's boards/models.py BOARD_ITEM_TYPES. A "pin" is
 * a small fixed-size marker that exists only to anchor a comment thread to a
 * spot on the board — it has no content of its own. */
export type BoardItemType =
  | "note"
  | "image"
  | "pin"
  | "todo"
  | "link"
  | "file"
  | "column"
  | "board"
  | "line";

export interface NoteContent {
  text: string;
}
export interface ImageContent {
  file_id: string;
  file_name?: string;
}
export interface FileContent {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  size?: number;
}
export interface TitledContent {
  title: string;
}
export interface BoardCardContent {
  board_id: string;
  title: string;
}
export interface LinkContent {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
}
export type LineArrow = "none" | "end" | "both";
export interface LineContent {
  from: string | null;
  to: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  arrow: LineArrow;
}
export type BoardItemContent =
  | NoteContent
  | ImageContent
  | FileContent
  | TitledContent
  | BoardCardContent
  | LinkContent
  | LineContent
  | Record<string, never>;

/** Keep in sync with binx-api's boards/models.py BOARD_APPROVAL_STATUSES. */
export type BoardApprovalStatus = "pending" | "approved" | "changes_requested";

export interface BoardItem {
  id: string;
  board_id: string;
  type: BoardItemType;
  /** The column this card is stacked in (null = free on the board). */
  parent_id?: string | null;
  /** Order within its column. */
  position?: number;
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
  /** Client-approval workflow — null means it was never requested. */
  approval_status: BoardApprovalStatus | null;
  approval_requested_by_name: string | null;
  approval_decided_by_name: string | null;
  approval_decided_at: string | null;
  approval_note: string | null;
  /** Version pinning — null until approval has been requested at least once.
   * `version_number` is the most recent snapshot (whatever its decision);
   * `approved_version_number` is the last one actually approved, and keeps
   * pointing at it even once a later edit reopens the card for re-approval. */
  version_number: number | null;
  approved_version_number: number | null;
  /** {emoji: count}. The realtime item events omit these — the store keeps them. */
  reactions: Record<string, number>;
  /** Which reaction kinds the current viewer has on this card. */
  my_reactions: string[];
  comment_count: number;
  /** Board cards only (board GET): cards on the sub-board, and cards anywhere
   * beneath it awaiting the client's review. */
  child_count?: number | null;
  pending_count?: number | null;
}

/** A row on a to-do card — a real project task (see binx-api BoardTaskRead).
 * `done` = it sits in the project's last Kanban list. */
export interface BoardTask {
  id: string;
  item_id: string | null;
  title: string;
  done: boolean;
  due_date: string | null;
  position: number;
  assignee_id?: string | null;
  assignee_name?: string | null;
}

export interface BoardCrumb {
  id: string;
  title: string | null;
}

export type BoardComment = Omit<Schemas["BoardCommentRead"], "author_kind"> & {
  author_kind: "agency" | "client";
};

/** One immutable approval-cycle snapshot of a card — see binx-api's
 * boards/models.py::BoardItemVersion. */
export type BoardItemVersion = Omit<Schemas["BoardItemVersionRead"], "content"> & {
  content: BoardItemContent;
};

/** The fixed reaction set — keep in sync with binx-api's REACTION_KINDS. */
export const REACTION_EMOJI: string[] = ["👍", "❤️", "🎉", "👀", "🚀"];

// `BoardItem` (above) stays hand-written — the canvas store depends on
// `content` being the discriminated union and on `reactions` always being
// present, both of which the generated `BoardItemRead` widens.
export interface Board {
  board_id: string;
  parent_id?: string | null;
  title?: string | null;
  path: BoardCrumb[];
  items: BoardItem[];
  tasks: BoardTask[];
}

/** A patch the canvas sends on drag / resize / edit — every field optional. */
export interface BoardItemPatch {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
  content?: BoardItemContent | Record<string, unknown>;
  color?: string | null;
  clear_color?: boolean;
  /** Drop into this column (at `position`, or the end). */
  parent_id?: string | null;
  /** Take the card out of its column, back onto the board. */
  clear_parent?: boolean;
  position?: number;
  /** Move onto another of the project's boards. */
  board_id?: string;
}

export interface BoardTaskPatch {
  title?: string;
  done?: boolean;
  due_date?: string | null;
  clear_due_date?: boolean;
  assignee_id?: string | null;
  clear_assignee?: boolean;
  position?: number;
}

/** The realtime events binx-api pushes over the shared websocket. */
export type BoardEvent =
  | { type: "board.item.created"; board_id: string; data: BoardItem }
  | { type: "board.item.updated"; board_id: string; data: BoardItem }
  | { type: "board.item.deleted"; board_id: string; data: { id: string } }
  | {
      type: "board.item.reaction";
      board_id: string;
      data: {
        item_id: string;
        user_id: string;
        kind: string;
        added: boolean;
        reactions: Record<string, number>;
      };
    }
  | { type: "board.comment.created"; board_id: string; data: BoardComment }
  | {
      type: "board.comment.deleted";
      board_id: string;
      data: { id: string; item_id: string };
    }
  | { type: "board.task.upserted"; board_id: string; data: BoardTask }
  | {
      type: "board.task.deleted";
      board_id: string;
      data: { id: string; item_id: string };
    };

export const BOARD_EVENT_TYPES = new Set([
  "board.item.created",
  "board.item.updated",
  "board.item.deleted",
  "board.item.reaction",
  "board.comment.created",
  "board.comment.deleted",
  "board.task.upserted",
  "board.task.deleted",
]);

// Geometry (canvas units == CSS px at zoom 1). Mirrors boards/service.py.
export const MIN_ITEM_SIZE = 60;
export const MAX_ITEM_SIZE = 4000;
export const DEFAULT_NOTE_WIDTH = 220;
export const DEFAULT_NOTE_HEIGHT = 160;
export const DEFAULT_COLUMN_WIDTH = 260;
/** A pin is always this size — fixed, not resizable. Taller than wide: it
 * renders as a map-pin teardrop, and the tail's tip (the bounding box's
 * bottom-center, not its center) is the anchored spot. */
export const PIN_WIDTH = 28;
export const PIN_HEIGHT = 36;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

/** What a column may hold — mirrors boards/models.py COLUMN_CHILD_TYPES. */
export const COLUMN_CHILD_TYPES = new Set<BoardItemType>([
  "note",
  "image",
  "todo",
  "link",
  "file",
  "board",
]);
/** Cards a client can be asked to approve — mirrors APPROVABLE_TYPES. A
 * column's request fans out to these inside it. */
export const APPROVABLE_TYPES = new Set<BoardItemType>([
  "note",
  "image",
  "link",
  "file",
]);
/** Cards whose height follows their content (Milanote-style); only their
 * width is resizable. Notes and images keep a fixed, resizable box. */
export const AUTO_HEIGHT_TYPES = new Set<BoardItemType>([
  "todo",
  "link",
  "file",
  "board",
  "column",
]);

/** The note background swatches offered in the card's colour row. White
 * first — Milanote's plain card. */
export const NOTE_COLORS: string[] = [
  "#ffffff", // white
  "#fef9c3", // yellow
  "#dbeafe", // blue
  "#dcfce7", // green
  "#fce7f3", // pink
  "#ede9fe", // purple
  "#f1f5f9", // slate
];
export const DEFAULT_NOTE_COLOR = NOTE_COLORS[0];

/** Board-card / column accent colours (the coloured tile on a board card). */
export const BOARD_COLORS: string[] = [
  "#4f46e5",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#64748b",
];

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
  return item.type === "note"
    ? String((item.content as NoteContent).text ?? "")
    : "";
}

export function cardTitle(item: BoardItem): string {
  return String((item.content as Partial<TitledContent>).title ?? "");
}

export function imageFileId(item: BoardItem): string | null {
  return item.type === "image" || item.type === "file"
    ? ((item.content as ImageContent).file_id ?? null)
    : null;
}

export function childBoardId(item: BoardItem): string | null {
  return item.type === "board"
    ? ((item.content as BoardCardContent).board_id ?? null)
    : null;
}

export function lineContent(item: BoardItem): LineContent {
  const c = item.content as Partial<LineContent>;
  return {
    from: c.from ?? null,
    to: c.to ?? null,
    x1: Number(c.x1 ?? item.x),
    y1: Number(c.y1 ?? item.y),
    x2: Number(c.x2 ?? item.x + item.width),
    y2: Number(c.y2 ?? item.y + item.height),
    arrow: c.arrow ?? "end",
  };
}

export function formatBytes(size: number | undefined): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Where a straight line from `from` toward `toward` leaves `rect`'s edge —
 * so an attached connector meets the card's border, not its centre. */
export function edgePoint(
  rect: { x: number; y: number; width: number; height: number },
  toward: { x: number; y: number },
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** A column's approval roll-up: how many of its approvable cards are in each
 * state. */
export function columnApprovalSummary(children: BoardItem[]): {
  total: number;
  pending: number;
  approved: number;
  changes: number;
} {
  const approvable = children.filter((c) => APPROVABLE_TYPES.has(c.type));
  return {
    total: approvable.length,
    pending: approvable.filter((c) => c.approval_status === "pending").length,
    approved: approvable.filter((c) => c.approval_status === "approved").length,
    changes: approvable.filter((c) => c.approval_status === "changes_requested")
      .length,
  };
}

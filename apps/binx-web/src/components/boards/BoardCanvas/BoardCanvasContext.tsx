/**
 * BoardCanvasContext.tsx
 *
 * Shared plumbing for everything rendered inside one BoardCanvas — the
 * server-action adapter, who's viewing, selection, the canvas-level drag
 * controller, and the current drop target — so cards nested inside columns
 * don't need a dozen props threaded through every layer.
 *
 * @module apps/binx-web/src/components/boards/BoardCanvas/BoardCanvasContext.tsx
 * @author Binx Portal
 */
"use client";

import { createContext, useContext } from "react";

import type {
  BoardComment,
  BoardItem,
  BoardItemPatch,
  BoardItemVersion,
  BoardTask,
  BoardTaskPatch,
} from "@/lib/boards-client";
import type {
  BoardReactions,
  CreateBoardItemInput,
  UploadPlacement,
} from "@/lib/boards";

export interface TodoOptions {
  tasks?: { id: string; title: string; list_name: string }[];
  members?: { user_id: string; full_name: string }[];
  error?: string;
}

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
    placement: UploadPlacement,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  /** Any non-image file → a file card. */
  uploadFile?: (
    file: File,
    placement: UploadPlacement,
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
  /** Agency side only — asks the client to review this card (or every card
   * in a column). */
  requestApproval?: (
    id: string,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  /** Agency side only — clears the card's approval state. */
  withdrawApproval?: (
    id: string,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  /** Client-portal side only — approves or asks for changes on a pending card
   * (or on every pending card in a column). */
  decideApproval?: (
    id: string,
    decision: "approved" | "changes_requested",
    note?: string,
  ) => Promise<{ item?: BoardItem; error?: string }>;
  /** A card's approval history — every version it's ever been through. */
  listVersions: (
    id: string,
  ) => Promise<{ versions?: BoardItemVersion[]; error?: string }>;
  // To-do rows (agency side only — the portal shows them read-only).
  addTask?: (
    itemId: string,
    title: string,
  ) => Promise<{ task?: BoardTask; error?: string }>;
  attachTask?: (
    itemId: string,
    taskId: string,
  ) => Promise<{ task?: BoardTask; error?: string }>;
  updateTask?: (
    itemId: string,
    taskId: string,
    patch: BoardTaskPatch,
  ) => Promise<{ task?: BoardTask; error?: string }>;
  removeTask?: (
    itemId: string,
    taskId: string,
    deleteTask: boolean,
  ) => Promise<{ error?: string }>;
  todoOptions?: () => Promise<TodoOptions>;
}

export type DropTarget =
  | { kind: "column"; id: string; index: number }
  | { kind: "board"; id: string; boardId: string };

export interface BoardCanvasContextValue {
  actions: BoardCanvasActions;
  imageUrl: (fileId: string) => string;
  fileUrl: (fileId: string) => string;
  currentUserId: string;
  canModerate: boolean;
  viewerKind: "agency" | "client";
  zoom: number;
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Begin a (thresholded) move of `item` — the canvas owns the gesture so a
   * card can leave or join a column mid-drag. */
  startDrag: (item: BoardItem, event: React.PointerEvent) => void;
  /** Begin drawing a connector line out of `item`. */
  startConnect: (item: BoardItem, event: React.PointerEvent) => void;
  dropTarget: DropTarget | null;
  /** The card that should open straight into edit mode (just created). */
  autoEditId: string | null;
  autoOpenCommentsId: string | null;
  openBoard: (boardId: string) => void;
  onError: (message: string) => void;
}

export const BoardCanvasContext = createContext<BoardCanvasContextValue | null>(
  null,
);

export function useBoardCanvas(): BoardCanvasContextValue {
  const ctx = useContext(BoardCanvasContext);
  if (!ctx) throw new Error("useBoardCanvas must be used inside BoardCanvas");
  return ctx;
}

/** True when a pointerdown landed on something interactive inside a card —
 * those clicks select the card but must not start a drag. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "button, input, textarea, select, a, label, [contenteditable='true'], [data-no-drag]",
    ) !== null
  );
}

/**
 * use-board-store.ts
 *
 * Client-side state for one project collaboration canvas: every card keyed by
 * id, plus loaded comment threads and the socket status. The BoardProvider
 * seeds it from the server render, then keeps it live by applying websocket
 * events (`applyEvent`) and the results of the canvas's own optimistic edits.
 * Like `use-messaging-store.ts`, this is a deliberate departure from the app's
 * usual "mutate, then re-render the route" — a shared canvas needs socket-driven,
 * sub-second updates.
 *
 * The `activeIds` set holds cards this client is *currently* dragging, resizing
 * or editing. Incoming geometry updates for those are ignored so a remote echo
 * can't yank a card out from under the user's pointer — the optimistic-echo
 * skip from the messaging store.
 *
 * Reaction / comment counts are managed separately from the card body: the
 * realtime `board.item.*` events omit them, and `upsertItem` carries the
 * existing values forward so an `updated` echo never wipes them.
 *
 * `tasksById` holds the rows of the board's to-do cards (real project tasks,
 * see binx-api BoardTaskRead) — kept live by `board.task.*` events, which
 * also fire when a task is moved on the Kanban.
 *
 * @module apps/binx-web/src/stores/use-board-store.ts
 * @author Binx Portal
 */
import { create } from "zustand";

import type {
  BoardComment,
  BoardEvent,
  BoardItem,
  BoardItemPatch,
  BoardTask,
} from "@/lib/boards-client";

export type SocketStatus = "connecting" | "open" | "closed";

const EMPTY_META = {
  reactions: {} as Record<string, number>,
  my_reactions: [] as string[],
  comment_count: 0,
};

interface BoardState {
  boardId: string | null;
  currentUserId: string;
  itemsById: Record<string, BoardItem>;
  tasksById: Record<string, BoardTask>;
  /** Rendered size of each free card / column (canvas units). Auto-height
   * cards (to-do, link, column…) don't keep `height` current, so connector
   * lines, the minimap and fit-to-view read this instead. */
  sizesById: Record<string, { width: number; height: number }>;
  commentsByItem: Record<string, BoardComment[]>;
  activeIds: Set<string>;
  socketStatus: SocketStatus;

  seed: (
    boardId: string,
    items: BoardItem[],
    currentUserId: string,
    tasks?: BoardTask[],
  ) => void;
  setItems: (items: BoardItem[], tasks?: BoardTask[]) => void;
  upsertTask: (task: BoardTask) => void;
  patchTask: (id: string, patch: Partial<BoardTask>) => void;
  removeTask: (id: string) => void;
  setSize: (id: string, width: number, height: number) => void;
  upsertItem: (item: BoardItem) => void;
  patchItem: (id: string, patch: BoardItemPatch) => void;
  removeItem: (id: string) => void;
  setReactions: (
    id: string,
    reactions: Record<string, number>,
    myReactions?: string[],
  ) => void;
  setComments: (itemId: string, comments: BoardComment[]) => void;
  addComment: (comment: BoardComment) => void;
  removeComment: (itemId: string, commentId: string) => void;
  setActive: (id: string, active: boolean) => void;
  setSocketStatus: (status: SocketStatus) => void;
  applyEvent: (event: BoardEvent) => void;
}

function orderedItems(state: BoardState): BoardItem[] {
  return Object.values(state.itemsById).sort((a, b) => a.z - b.z);
}

/** Merge a fresh card from the server/socket, keeping reaction+comment meta
 * that the item events don't carry (unless the incoming card actually has it —
 * the board GET does). */
function mergeItem(
  existing: BoardItem | undefined,
  incoming: BoardItem,
): BoardItem {
  if (!existing) return { ...EMPTY_META, ...incoming };
  return {
    ...incoming,
    reactions: incoming.reactions ?? existing.reactions,
    my_reactions: incoming.my_reactions ?? existing.my_reactions,
    comment_count: incoming.comment_count ?? existing.comment_count,
  };
}

export const useBoardStore = create<BoardState>((set, get) => ({
  boardId: null,
  currentUserId: "",
  itemsById: {},
  tasksById: {},
  sizesById: {},
  commentsByItem: {},
  activeIds: new Set(),
  socketStatus: "connecting",

  seed: (boardId, items, currentUserId, tasks = []) =>
    set({
      boardId,
      currentUserId,
      itemsById: Object.fromEntries(
        items.map((item) => [item.id, { ...EMPTY_META, ...item }]),
      ),
      tasksById: Object.fromEntries(tasks.map((task) => [task.id, task])),
      sizesById: {},
      commentsByItem: {},
      activeIds: new Set(),
    }),

  setItems: (items, tasks) =>
    set((state) => ({
      itemsById: Object.fromEntries(
        items.map((item) => [
          item.id,
          // A card mid-gesture keeps its local geometry (resync can land
          // while the user is dragging).
          state.activeIds.has(item.id) && state.itemsById[item.id]
            ? state.itemsById[item.id]
            : mergeItem(state.itemsById[item.id], item),
        ]),
      ),
      ...(tasks
        ? { tasksById: Object.fromEntries(tasks.map((t) => [t.id, t])) }
        : {}),
    })),

  upsertTask: (task) =>
    set((state) => ({ tasksById: { ...state.tasksById, [task.id]: task } })),

  patchTask: (id, patch) =>
    set((state) => {
      const existing = state.tasksById[id];
      if (!existing) return state;
      return { tasksById: { ...state.tasksById, [id]: { ...existing, ...patch } } };
    }),

  setSize: (id, width, height) =>
    set((state) => {
      const prev = state.sizesById[id];
      if (prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5)
        return state;
      return { sizesById: { ...state.sizesById, [id]: { width, height } } };
    }),

  removeTask: (id) =>
    set((state) => {
      if (!(id in state.tasksById)) return state;
      const rest = { ...state.tasksById };
      delete rest[id];
      return { tasksById: rest };
    }),

  upsertItem: (item) =>
    set((state) => ({
      itemsById: {
        ...state.itemsById,
        [item.id]: mergeItem(state.itemsById[item.id], item),
      },
    })),

  patchItem: (id, patch) =>
    set((state) => {
      const existing = state.itemsById[id];
      if (!existing) return state;
      const next: BoardItem = { ...existing };
      if (patch.x !== undefined) next.x = patch.x;
      if (patch.y !== undefined) next.y = patch.y;
      if (patch.width !== undefined) next.width = patch.width;
      if (patch.height !== undefined) next.height = patch.height;
      if (patch.z !== undefined) next.z = patch.z;
      if (patch.clear_color) next.color = null;
      else if (patch.color !== undefined) next.color = patch.color;
      if (patch.content !== undefined)
        next.content = patch.content as BoardItem["content"];
      if (patch.clear_parent) {
        next.parent_id = null;
        next.position = 0;
      } else if (patch.parent_id !== undefined) {
        next.parent_id = patch.parent_id;
      }
      if (patch.position !== undefined) next.position = patch.position;
      return { itemsById: { ...state.itemsById, [id]: next } };
    }),

  removeItem: (id) =>
    set((state) => {
      if (!(id in state.itemsById)) return state;
      const rest = { ...state.itemsById };
      delete rest[id];
      return { itemsById: rest };
    }),

  setReactions: (id, reactions, myReactions) =>
    set((state) => {
      const existing = state.itemsById[id];
      if (!existing) return state;
      return {
        itemsById: {
          ...state.itemsById,
          [id]: {
            ...existing,
            reactions,
            my_reactions: myReactions ?? existing.my_reactions,
          },
        },
      };
    }),

  setComments: (itemId, comments) =>
    set((state) => ({
      commentsByItem: { ...state.commentsByItem, [itemId]: comments },
      itemsById: state.itemsById[itemId]
        ? {
            ...state.itemsById,
            [itemId]: {
              ...state.itemsById[itemId],
              comment_count: comments.length,
            },
          }
        : state.itemsById,
    })),

  addComment: (comment) =>
    set((state) => {
      const current = state.commentsByItem[comment.item_id] ?? [];
      if (current.some((c) => c.id === comment.id)) return state;
      const next = [...current, comment];
      const item = state.itemsById[comment.item_id];
      return {
        commentsByItem: { ...state.commentsByItem, [comment.item_id]: next },
        itemsById: item
          ? {
              ...state.itemsById,
              [comment.item_id]: {
                ...item,
                comment_count: item.comment_count + 1,
              },
            }
          : state.itemsById,
      };
    }),

  removeComment: (itemId, commentId) =>
    set((state) => {
      const current = state.commentsByItem[itemId];
      const item = state.itemsById[itemId];
      const filtered = current?.filter((c) => c.id !== commentId);
      return {
        commentsByItem: filtered
          ? { ...state.commentsByItem, [itemId]: filtered }
          : state.commentsByItem,
        itemsById: item
          ? {
              ...state.itemsById,
              [itemId]: {
                ...item,
                comment_count: Math.max(0, item.comment_count - 1),
              },
            }
          : state.itemsById,
      };
    }),

  setActive: (id, active) =>
    set((state) => {
      const activeIds = new Set(state.activeIds);
      if (active) activeIds.add(id);
      else activeIds.delete(id);
      return { activeIds };
    }),

  setSocketStatus: (socketStatus) => set({ socketStatus }),

  applyEvent: (event) => {
    switch (event.type) {
      case "board.item.deleted":
        get().removeItem(event.data.id);
        return;
      case "board.item.created":
      case "board.item.updated": {
        if (get().activeIds.has(event.data.id)) return; // don't fight the local pointer
        get().upsertItem(event.data);
        return;
      }
      case "board.item.reaction": {
        const mine = event.data.user_id === get().currentUserId;
        const existing = get().itemsById[event.data.item_id];
        let myReactions = existing?.my_reactions;
        if (mine && existing) {
          myReactions = event.data.added
            ? [
                ...existing.my_reactions.filter((k) => k !== event.data.kind),
                event.data.kind,
              ]
            : existing.my_reactions.filter((k) => k !== event.data.kind);
        }
        get().setReactions(
          event.data.item_id,
          event.data.reactions,
          myReactions,
        );
        return;
      }
      case "board.comment.created":
        get().addComment(event.data);
        return;
      case "board.comment.deleted":
        get().removeComment(event.data.item_id, event.data.id);
        return;
      case "board.task.upserted":
        get().upsertTask(event.data);
        return;
      case "board.task.deleted":
        get().removeTask(event.data.id);
        return;
    }
  },
}));

export { orderedItems };

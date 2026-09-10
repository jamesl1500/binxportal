/**
 * use-board-store.ts
 *
 * Client-side state for one project collaboration canvas: every card keyed by
 * id, plus loaded comment threads and the socket status. The BoardProvider
 * seeds it from the server render, then keeps it live by applying websocket
 * events (`applyEvent`) and the results of the canvas's own optimistic edits.
 * Like `use-messaging-store.ts`, this is a deliberate departure from the app's
 * usual "mutate then router.refresh()" — a shared canvas needs socket-driven,
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
 * @module apps/binx-web/src/stores/use-board-store.ts
 * @author Binx.io
 */
import { create } from "zustand";

import type { BoardComment, BoardEvent, BoardItem, BoardItemPatch } from "@/lib/boards-client";

export type SocketStatus = "connecting" | "open" | "closed";

const EMPTY_META = { reactions: {} as Record<string, number>, my_reactions: [] as string[], comment_count: 0 };

interface BoardState {
  boardId: string | null;
  currentUserId: string;
  itemsById: Record<string, BoardItem>;
  commentsByItem: Record<string, BoardComment[]>;
  activeIds: Set<string>;
  socketStatus: SocketStatus;

  seed: (boardId: string, items: BoardItem[], currentUserId: string) => void;
  setItems: (items: BoardItem[]) => void;
  upsertItem: (item: BoardItem) => void;
  patchItem: (id: string, patch: BoardItemPatch) => void;
  removeItem: (id: string) => void;
  setReactions: (id: string, reactions: Record<string, number>, myReactions?: string[]) => void;
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
function mergeItem(existing: BoardItem | undefined, incoming: BoardItem): BoardItem {
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
  commentsByItem: {},
  activeIds: new Set(),
  socketStatus: "connecting",

  seed: (boardId, items, currentUserId) =>
    set({
      boardId,
      currentUserId,
      itemsById: Object.fromEntries(items.map((item) => [item.id, { ...EMPTY_META, ...item }])),
      commentsByItem: {},
      activeIds: new Set(),
    }),

  setItems: (items) =>
    set((state) => ({
      itemsById: Object.fromEntries(items.map((item) => [item.id, mergeItem(state.itemsById[item.id], item)])),
    })),

  upsertItem: (item) =>
    set((state) => ({ itemsById: { ...state.itemsById, [item.id]: mergeItem(state.itemsById[item.id], item) } })),

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
      if (patch.content !== undefined) next.content = patch.content;
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
          [id]: { ...existing, reactions, my_reactions: myReactions ?? existing.my_reactions },
        },
      };
    }),

  setComments: (itemId, comments) =>
    set((state) => ({
      commentsByItem: { ...state.commentsByItem, [itemId]: comments },
      itemsById: state.itemsById[itemId]
        ? { ...state.itemsById, [itemId]: { ...state.itemsById[itemId], comment_count: comments.length } }
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
          ? { ...state.itemsById, [comment.item_id]: { ...item, comment_count: item.comment_count + 1 } }
          : state.itemsById,
      };
    }),

  removeComment: (itemId, commentId) =>
    set((state) => {
      const current = state.commentsByItem[itemId];
      const item = state.itemsById[itemId];
      const filtered = current?.filter((c) => c.id !== commentId);
      return {
        commentsByItem: filtered ? { ...state.commentsByItem, [itemId]: filtered } : state.commentsByItem,
        itemsById: item
          ? { ...state.itemsById, [itemId]: { ...item, comment_count: Math.max(0, item.comment_count - 1) } }
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
            ? [...existing.my_reactions.filter((k) => k !== event.data.kind), event.data.kind]
            : existing.my_reactions.filter((k) => k !== event.data.kind);
        }
        get().setReactions(event.data.item_id, event.data.reactions, myReactions);
        return;
      }
      case "board.comment.created":
        get().addComment(event.data);
        return;
      case "board.comment.deleted":
        get().removeComment(event.data.item_id, event.data.id);
        return;
    }
  },
}));

export { orderedItems };

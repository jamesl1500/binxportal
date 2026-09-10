import { beforeEach, describe, expect, it } from "vitest";

import type { BoardComment, BoardItem } from "@/lib/boards-client";
import { orderedItems, useBoardStore } from "@/stores/use-board-store";

function item(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: "i1",
    board_id: "b1",
    type: "note",
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    z: 1,
    content: { text: "hi" },
    color: null,
    author_kind: "agency",
    created_by_id: "u1",
    created_by_name: "Ada",
    reactions: {},
    my_reactions: [],
    comment_count: 0,
    ...overrides,
  };
}

function comment(overrides: Partial<BoardComment> = {}): BoardComment {
  return {
    id: "c1",
    item_id: "a",
    author_kind: "agency",
    author_user_id: "u2",
    author_name: "Bea",
    body: "nice",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  useBoardStore.getState().seed("b1", [], "viewer-1");
});

describe("useBoardStore", () => {
  it("seeds and orders items by z", () => {
    useBoardStore.getState().seed("b1", [item({ id: "a", z: 3 }), item({ id: "b", z: 1 })], "viewer-1");
    expect(orderedItems(useBoardStore.getState()).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("applyEvent upserts on created/updated and drops on deleted", () => {
    const store = useBoardStore.getState();
    store.applyEvent({ type: "board.item.created", board_id: "b1", data: item({ id: "a" }) });
    expect(useBoardStore.getState().itemsById.a).toBeDefined();

    store.applyEvent({ type: "board.item.updated", board_id: "b1", data: item({ id: "a", x: 999 }) });
    expect(useBoardStore.getState().itemsById.a.x).toBe(999);

    store.applyEvent({ type: "board.item.deleted", board_id: "b1", data: { id: "a" } });
    expect(useBoardStore.getState().itemsById.a).toBeUndefined();
  });

  it("ignores an incoming update for a card the local pointer is holding", () => {
    const store = useBoardStore.getState();
    store.upsertItem(item({ id: "a", x: 10 }));
    store.setActive("a", true);

    store.applyEvent({ type: "board.item.updated", board_id: "b1", data: item({ id: "a", x: 500 }) });
    expect(useBoardStore.getState().itemsById.a.x).toBe(10);

    store.setActive("a", false);
    store.applyEvent({ type: "board.item.updated", board_id: "b1", data: item({ id: "a", x: 500 }) });
    expect(useBoardStore.getState().itemsById.a.x).toBe(500);
  });

  it("an item.updated echo keeps reaction + comment meta the event omits", () => {
    const store = useBoardStore.getState();
    store.upsertItem(item({ id: "a", reactions: { "👍": 2 }, my_reactions: ["👍"], comment_count: 3 }));
    // the wire payload for a board.item.* event has no reaction/comment fields
    const wire = item({ id: "a", x: 5 }) as Partial<BoardItem>;
    delete wire.reactions;
    delete wire.my_reactions;
    delete wire.comment_count;
    store.applyEvent({ type: "board.item.updated", board_id: "b1", data: wire as BoardItem });
    const card = useBoardStore.getState().itemsById.a;
    expect(card.x).toBe(5);
    expect(card.reactions).toEqual({ "👍": 2 });
    expect(card.my_reactions).toEqual(["👍"]);
    expect(card.comment_count).toBe(3);
  });

  it("patchItem applies a partial patch and clear_color", () => {
    const store = useBoardStore.getState();
    store.upsertItem(item({ id: "a", color: "#fff" }));
    store.patchItem("a", { x: 42, clear_color: true });
    expect(useBoardStore.getState().itemsById.a.x).toBe(42);
    expect(useBoardStore.getState().itemsById.a.color).toBeNull();
  });

  it("a reaction event updates counts, and my_reactions only for the viewer", () => {
    const store = useBoardStore.getState();
    store.upsertItem(item({ id: "a" }));

    store.applyEvent({
      type: "board.item.reaction",
      board_id: "b1",
      data: { item_id: "a", user_id: "someone-else", kind: "👍", added: true, reactions: { "👍": 1 } },
    });
    expect(useBoardStore.getState().itemsById.a.reactions).toEqual({ "👍": 1 });
    expect(useBoardStore.getState().itemsById.a.my_reactions).toEqual([]);

    store.applyEvent({
      type: "board.item.reaction",
      board_id: "b1",
      data: { item_id: "a", user_id: "viewer-1", kind: "👍", added: true, reactions: { "👍": 2 } },
    });
    expect(useBoardStore.getState().itemsById.a.my_reactions).toEqual(["👍"]);

    store.applyEvent({
      type: "board.item.reaction",
      board_id: "b1",
      data: { item_id: "a", user_id: "viewer-1", kind: "👍", added: false, reactions: { "👍": 1 } },
    });
    expect(useBoardStore.getState().itemsById.a.my_reactions).toEqual([]);
  });

  it("comment events adjust the thread and the count", () => {
    const store = useBoardStore.getState();
    store.upsertItem(item({ id: "a", comment_count: 0 }));
    store.setComments("a", []);

    store.applyEvent({ type: "board.comment.created", board_id: "b1", data: comment({ id: "c1", item_id: "a" }) });
    expect(useBoardStore.getState().commentsByItem.a.map((c) => c.id)).toEqual(["c1"]);
    expect(useBoardStore.getState().itemsById.a.comment_count).toBe(1);

    // a duplicate (our own optimistic add echoed back) is ignored
    store.applyEvent({ type: "board.comment.created", board_id: "b1", data: comment({ id: "c1", item_id: "a" }) });
    expect(useBoardStore.getState().itemsById.a.comment_count).toBe(1);

    store.applyEvent({ type: "board.comment.deleted", board_id: "b1", data: { id: "c1", item_id: "a" } });
    expect(useBoardStore.getState().commentsByItem.a).toEqual([]);
    expect(useBoardStore.getState().itemsById.a.comment_count).toBe(0);
  });
});

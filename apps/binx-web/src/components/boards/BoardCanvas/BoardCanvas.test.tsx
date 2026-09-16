import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), loading: vi.fn(), dismiss: vi.fn(), success: vi.fn() }),
}));

import type { BoardItem } from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";

import BoardCanvas, { type BoardCanvasActions } from "./BoardCanvas";

function item(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: "i1",
    board_id: "b1",
    type: "note",
    x: 20,
    y: 30,
    width: 200,
    height: 150,
    z: 1,
    content: { text: "seeded note" },
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

function makeActions(): BoardCanvasActions {
  return {
    create: vi.fn(async (input) => ({ item: item({ id: "new", type: input.type }) })),
    update: vi.fn(async () => ({ item: item() })),
    remove: vi.fn(async () => ({})),
    uploadImage: vi.fn(async () => ({ item: item({ id: "img", type: "image" }) })),
    toggleReaction: vi.fn(async () => ({ result: { reactions: { "👍": 1 }, my_reactions: ["👍"] } })),
    listComments: vi.fn(async () => ({ comments: [] })),
    addComment: vi.fn(async (_id, body) => ({
      comment: {
        id: "c1",
        item_id: "i1",
        author_kind: "agency" as const,
        author_user_id: "u1",
        author_name: "Ada",
        body,
        created_at: new Date().toISOString(),
      },
    })),
    deleteComment: vi.fn(async () => ({})),
  };
}

const baseProps = { currentUserId: "u1", canModerate: true };

beforeEach(() => {
  useBoardStore.getState().seed("b1", [], "u1");
});

describe("BoardCanvas", () => {
  it("renders seeded cards", () => {
    useBoardStore.getState().seed("b1", [item()], "u1");
    render(<BoardCanvas actions={makeActions()} imageUrl={(id) => `/img/${id}`} {...baseProps} />);
    expect(screen.getByText("seeded note")).toBeInTheDocument();
  });

  it("shows the empty hint with no cards", () => {
    render(<BoardCanvas actions={makeActions()} imageUrl={(id) => `/img/${id}`} {...baseProps} />);
    expect(screen.getByText(/an empty canvas/i)).toBeInTheDocument();
  });

  it("adds a note via the toolbar", async () => {
    const actions = makeActions();
    render(<BoardCanvas actions={actions} imageUrl={(id) => `/img/${id}`} {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /note/i }));

    await waitFor(() => expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ type: "note" })));
    await waitFor(() => expect(useBoardStore.getState().itemsById.new).toBeDefined());
  });

  it("toggles a reaction on the selected card", async () => {
    const actions = makeActions();
    useBoardStore.getState().seed("b1", [item()], "u1");
    render(<BoardCanvas actions={actions} imageUrl={(id) => `/img/${id}`} {...baseProps} />);

    fireEvent.pointerDown(screen.getByText("seeded note"));
    fireEvent.click(screen.getByRole("button", { name: "React 👍" }));

    await waitFor(() => expect(actions.toggleReaction).toHaveBeenCalledWith("i1", "👍"));
    await waitFor(() => expect(useBoardStore.getState().itemsById.i1.reactions).toEqual({ "👍": 1 }));
  });

  describe("deleting a card", () => {
    it("asks for confirmation instead of deleting immediately", () => {
      const actions = makeActions();
      useBoardStore.getState().seed("b1", [item()], "u1");
      render(<BoardCanvas actions={actions} imageUrl={(id) => `/img/${id}`} {...baseProps} />);

      fireEvent.pointerDown(screen.getByText("seeded note"));
      fireEvent.click(screen.getByRole("button", { name: "Delete card" }));

      expect(screen.getByText("Delete this card?")).toBeInTheDocument();
      expect(actions.remove).not.toHaveBeenCalled();
      expect(useBoardStore.getState().itemsById.i1).toBeDefined();
    });

    it("deletes the card once the confirm is accepted", async () => {
      const actions = makeActions();
      useBoardStore.getState().seed("b1", [item()], "u1");
      render(<BoardCanvas actions={actions} imageUrl={(id) => `/img/${id}`} {...baseProps} />);

      fireEvent.pointerDown(screen.getByText("seeded note"));
      fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
      fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));

      await waitFor(() => expect(actions.remove).toHaveBeenCalledWith("i1"));
      expect(useBoardStore.getState().itemsById.i1).toBeUndefined();
    });

    it("leaves the card untouched when the confirm is cancelled", () => {
      const actions = makeActions();
      useBoardStore.getState().seed("b1", [item()], "u1");
      render(<BoardCanvas actions={actions} imageUrl={(id) => `/img/${id}`} {...baseProps} />);

      fireEvent.pointerDown(screen.getByText("seeded note"));
      fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByText("Delete this card?")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Delete card" })).toBeInTheDocument();
      expect(actions.remove).not.toHaveBeenCalled();
      expect(useBoardStore.getState().itemsById.i1).toBeDefined();
    });
  });
});

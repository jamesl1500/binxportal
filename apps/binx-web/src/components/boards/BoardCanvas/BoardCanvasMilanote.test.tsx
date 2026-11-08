import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    success: vi.fn(),
  }),
}));

import type { BoardItem, BoardTask } from "@/lib/boards-client";
import { useBoardStore } from "@/stores/use-board-store";

import BoardCanvas, { type BoardCanvasActions } from "./BoardCanvas";

function item(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: "i1",
    board_id: "b1",
    type: "note",
    parent_id: null,
    position: 0,
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
    approval_status: null,
    approval_requested_by_name: null,
    approval_decided_by_name: null,
    approval_decided_at: null,
    approval_note: null,
    version_number: null,
    approved_version_number: null,
    reactions: {},
    my_reactions: [],
    comment_count: 0,
    ...overrides,
  };
}

function task(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "t1",
    item_id: "todo1",
    title: "Write copy",
    done: false,
    due_date: null,
    position: 0,
    assignee_id: null,
    assignee_name: null,
    ...overrides,
  };
}

function makeActions(): BoardCanvasActions {
  return {
    create: vi.fn(async (input) => ({
      item: item({ id: "new", type: input.type, content: (input.content ?? {}) as BoardItem["content"] }),
    })),
    update: vi.fn(async (id) => ({ item: useBoardStore.getState().itemsById[id] })),
    remove: vi.fn(async () => ({})),
    uploadImage: vi.fn(async () => ({ item: item({ id: "img", type: "image" }) })),
    uploadFile: vi.fn(async () => ({ item: item({ id: "file", type: "file" }) })),
    toggleReaction: vi.fn(async () => ({ result: { reactions: {}, my_reactions: [] } })),
    listComments: vi.fn(async () => ({ comments: [] })),
    addComment: vi.fn(async () => ({})),
    deleteComment: vi.fn(async () => ({})),
    requestApproval: vi.fn(async (id) => ({ item: useBoardStore.getState().itemsById[id] })),
    withdrawApproval: vi.fn(async (id) => ({ item: useBoardStore.getState().itemsById[id] })),
    decideApproval: vi.fn(async (id) => ({ item: useBoardStore.getState().itemsById[id] })),
    listVersions: vi.fn(async () => ({ versions: [] })),
    addTask: vi.fn(async (_itemId, title) => ({ task: task({ id: "t-new", title }) })),
    attachTask: vi.fn(async () => ({})),
    updateTask: vi.fn(async (_itemId, taskId, patch) => ({
      task: { ...useBoardStore.getState().tasksById[taskId], ...patch } as BoardTask,
    })),
    removeTask: vi.fn(async () => ({})),
    todoOptions: vi.fn(async () => ({ tasks: [], members: [] })),
  };
}

const staff = { currentUserId: "u1", canModerate: true, viewerKind: "agency" as const };
const client = { currentUserId: "u2", canModerate: false, viewerKind: "client" as const };
const img = (id: string) => `/img/${id}`;

beforeEach(() => {
  useBoardStore.getState().seed("b1", [], "u1");
});

describe("Milanote card rail", () => {
  it("offers to-do lists to the agency only", () => {
    const { unmount } = render(<BoardCanvas actions={makeActions()} imageUrl={img} {...staff} />);
    expect(screen.getByRole("button", { name: "Add to-do list" })).toBeInTheDocument();
    unmount();
    render(<BoardCanvas actions={makeActions()} imageUrl={img} {...client} />);
    expect(screen.queryByRole("button", { name: "Add to-do list" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add column" })).toBeInTheDocument();
  });

  it("adds a column on the open board", async () => {
    const actions = makeActions();
    render(<BoardCanvas actions={actions} imageUrl={img} {...staff} />);
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    await waitFor(() =>
      expect(actions.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "column", board_id: "b1" }),
      ),
    );
  });

  it("adds a link through the paste-a-link prompt", async () => {
    const actions = makeActions();
    render(<BoardCanvas actions={actions} imageUrl={img} {...staff} />);
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    fireEvent.change(screen.getByLabelText("Paste a link"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(actions.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "link", content: { url: "https://example.com" } }),
      ),
    );
  });
});

describe("to-do cards", () => {
  const todo = item({ id: "todo1", type: "todo", content: { title: "Launch" } });

  it("lists the card's tasks with progress and ticks one off", async () => {
    const actions = makeActions();
    useBoardStore
      .getState()
      .seed("b1", [todo], "u1", [task(), task({ id: "t2", title: "Ship it", done: true, position: 1 })]);
    render(<BoardCanvas actions={actions} imageUrl={img} {...staff} />);

    expect(screen.getByText("Launch")).toBeInTheDocument();
    expect(screen.getByLabelText("1 of 2 done")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark “Write copy” done" }));

    await waitFor(() => expect(actions.updateTask).toHaveBeenCalledWith("todo1", "t1", { done: true }));
    await waitFor(() => expect(useBoardStore.getState().tasksById.t1.done).toBe(true));
  });

  it("adds a task on Enter", async () => {
    const actions = makeActions();
    useBoardStore.getState().seed("b1", [todo], "u1", []);
    render(<BoardCanvas actions={actions} imageUrl={img} {...staff} />);

    const input = screen.getByLabelText("Add a task");
    fireEvent.change(input, { target: { value: "Book the shoot" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(actions.addTask).toHaveBeenCalledWith("todo1", "Book the shoot"));
    await waitFor(() => expect(useBoardStore.getState().tasksById["t-new"]).toBeDefined());
  });

  it("is read-only for the client", () => {
    useBoardStore.getState().seed("b1", [todo], "u2", [task()]);
    render(<BoardCanvas actions={makeActions()} imageUrl={img} {...client} />);
    expect(screen.getByRole("checkbox", { name: "Mark “Write copy” done" })).toBeDisabled();
    expect(screen.queryByLabelText("Add a task")).not.toBeInTheDocument();
  });

  it("a Kanban move arriving over the socket ticks the row", () => {
    useBoardStore.getState().seed("b1", [todo], "u1", [task()]);
    render(<BoardCanvas actions={makeActions()} imageUrl={img} {...staff} />);
    useBoardStore.getState().applyEvent({
      type: "board.task.upserted",
      board_id: "b1",
      data: task({ done: true }),
    });
    return waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Mark “Write copy” not done" })).toBeInTheDocument(),
    );
  });
});

describe("columns", () => {
  const column = item({ id: "col1", type: "column", content: { title: "Logo options" }, width: 260 });
  const childA = item({ id: "a", parent_id: "col1", position: 0, content: { text: "Option A" } });
  const childB = item({
    id: "b",
    parent_id: "col1",
    position: 1,
    content: { text: "Option B" },
    approval_status: "pending",
  });

  it("stacks its cards and rolls up their review state", () => {
    useBoardStore.getState().seed("b1", [column, childB, childA], "u1");
    render(<BoardCanvas actions={makeActions()} imageUrl={img} {...staff} />);
    const texts = screen.getAllByText(/Option [AB]/).map((el) => el.textContent);
    expect(texts).toEqual(["Option A", "Option B"]);
    expect(screen.getByText("1 awaiting review")).toBeInTheDocument();
  });

  it("lets the agency send the whole column for review", async () => {
    const actions = makeActions();
    useBoardStore.getState().seed("b1", [column, childA, childB], "u1");
    render(<BoardCanvas actions={actions} imageUrl={img} {...staff} />);

    fireEvent.pointerDown(screen.getByText("Logo options"));
    fireEvent.click(screen.getByRole("button", { name: "Send column for review" }));

    await waitFor(() => expect(actions.requestApproval).toHaveBeenCalledWith("col1"));
    await waitFor(() => expect(useBoardStore.getState().itemsById.a.approval_status).toBe("pending"));
  });

  it("lets the client approve everything pending in the column", async () => {
    const actions = makeActions();
    useBoardStore.getState().seed("b1", [column, childA, childB], "u2");
    render(<BoardCanvas actions={actions} imageUrl={img} {...client} />);

    fireEvent.pointerDown(screen.getByText("Logo options"));
    fireEvent.click(screen.getByRole("button", { name: "Approve all (1)" }));

    await waitFor(() => expect(actions.decideApproval).toHaveBeenCalledWith("col1", "approved"));
    await waitFor(() => expect(useBoardStore.getState().itemsById.b.approval_status).toBe("approved"));
  });
});

describe("nested boards", () => {
  const boardCard = item({
    id: "bc",
    type: "board",
    content: { board_id: "child-board", title: "Moodboard" },
    child_count: 3,
    pending_count: 2,
  });

  it("shows the board card and opens it", () => {
    const onOpenBoard = vi.fn();
    useBoardStore.getState().seed("b1", [boardCard], "u1");
    render(<BoardCanvas actions={makeActions()} imageUrl={img} {...staff} onOpenBoard={onOpenBoard} />);
    expect(screen.getByText("Moodboard")).toBeInTheDocument();
    expect(screen.getByText("3 cards")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open board Moodboard" }));
    expect(onOpenBoard).toHaveBeenCalledWith("child-board");
  });

  it("renders breadcrumbs from the path", () => {
    useBoardStore.getState().seed("child-board", [], "u1");
    render(
      <BoardCanvas
        actions={makeActions()}
        imageUrl={img}
        {...staff}
        rootTitle="Rebrand"
        path={[
          { id: "b1", title: null },
          { id: "child-board", title: "Moodboard" },
        ]}
        boardHref={(id) => (id ? `/c?board=${id}` : "/c")}
      />,
    );
    expect(screen.getByRole("link", { name: "Rebrand" })).toHaveAttribute("href", "/c");
    expect(screen.getByText("Moodboard")).toHaveAttribute("aria-current", "page");
  });

  it("points the client at sub-boards waiting on their review", () => {
    const onOpenBoard = vi.fn();
    useBoardStore.getState().seed("b1", [boardCard], "u2");
    render(<BoardCanvas actions={makeActions()} imageUrl={img} {...client} onOpenBoard={onOpenBoard} />);
    expect(screen.getByText(/2 cards await your review in “Moodboard”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open board" }));
    expect(onOpenBoard).toHaveBeenCalledWith("child-board");
  });
});

describe("lines", () => {
  it("draws a connector between two cards and deletes it", async () => {
    const actions = makeActions();
    const a = item({ id: "a", x: 0, y: 0 });
    const b = item({ id: "b", x: 400, y: 0, content: { text: "other" } });
    const line = item({
      id: "ln",
      type: "line",
      content: { from: "a", to: "b", x1: 0, y1: 0, x2: 400, y2: 0, arrow: "end" },
    });
    useBoardStore.getState().seed("b1", [a, b, line], "u1");
    const { container } = render(<BoardCanvas actions={actions} imageUrl={img} {...staff} />);

    const strokes = container.querySelectorAll("svg g > line");
    expect(strokes.length).toBe(2); // hit area + visible stroke
    fireEvent.pointerDown(strokes[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete line" }));
    await waitFor(() => expect(actions.remove).toHaveBeenCalledWith("ln"));
  });
});

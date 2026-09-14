import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  createTaskAction: vi.fn(),
  createTaskListAction: vi.fn(),
  deleteTaskListAction: vi.fn(),
  moveTaskAction: vi.fn(),
  moveTaskListAction: vi.fn(),
  renameTaskListAction: vi.fn(),
}));

// The detail panel has its own suite; stub it so this one is just the board.
vi.mock("@/components/forms/projects/TaskDetailPanel/TaskDetailPanel", () => ({
  default: () => null,
}));

import { moveTaskAction, moveTaskListAction } from "@/app/(app)/projects/[projectId]/actions";
import type { BoardColumn } from "@/lib/projects";

import KanbanBoard from "./KanbanBoard";

const mockedMove = vi.mocked(moveTaskAction);
const mockedMoveList = vi.mocked(moveTaskListAction);

const columns: BoardColumn[] = [
  {
    id: "list-todo",
    project_id: "project-1",
    name: "To Do",
    position: 0,
    tasks: [
      {
        id: "task-1",
        project_id: "project-1",
        list_id: "list-todo",
        title: "Draft the brief",
        description: null,
        position: 0,
        due_date: null,
        assignee_id: null,
        assignee_name: null,
        comment_count: 0,
        file_count: 0,
        tags: [],
      },
    ],
  },
  { id: "list-doing", project_id: "project-1", name: "In Progress", position: 1, tasks: [] },
];

function renderBoard() {
  return render(
    <KanbanBoard
      agencyId="agency-1"
      projectId="project-1"
      columns={columns}
      projectMembers={[]}
      projectTags={[]}
      currentUserId="user-1"
      canModerateComments={false}
    />,
  );
}

/** A minimal DataTransfer stand-in — jsdom doesn't implement one. */
function dataTransfer() {
  const store: Record<string, string> = {};
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: (key: string, value: string) => {
      store[key] = value;
    },
    getData: (key: string) => store[key] ?? "",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedMove.mockResolvedValue({ task: columns[0].tasks[0] });
  mockedMoveList.mockResolvedValue({ list: columns[0] });
});

describe("KanbanBoard", () => {
  it("has no per-card move control — lists are changed by dragging", () => {
    renderBoard();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/move .* to another list/i)).not.toBeInTheDocument();
  });

  it("moves a card to the column it is dropped on via moveTaskAction", async () => {
    renderBoard();

    const card = screen.getByText("Draft the brief").closest("[draggable]") as HTMLElement;
    const targetColumn = screen.getByText("In Progress").closest("div") as HTMLElement;
    const transfer = dataTransfer();

    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragOver(targetColumn, { dataTransfer: transfer });
    fireEvent.drop(targetColumn, { dataTransfer: transfer });

    await waitFor(() =>
      // dropped at the end of the (empty) destination list -> position 0
      expect(mockedMove).toHaveBeenCalledWith("agency-1", "project-1", "task-1", "list-doing", 0),
    );
  });

  it("does not call moveTaskAction when a card is dropped back on its own column", async () => {
    renderBoard();

    const card = screen.getByText("Draft the brief").closest("[draggable]") as HTMLElement;
    const ownColumn = screen.getByText("To Do").closest("div") as HTMLElement;
    const transfer = dataTransfer();

    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.drop(ownColumn, { dataTransfer: transfer });

    expect(mockedMove).not.toHaveBeenCalled();
  });

  it("reorders lists by dragging a column's grip handle onto another column", async () => {
    renderBoard();

    const todoHeader = screen.getByText("To Do").closest("div") as HTMLElement;
    const handle = todoHeader.querySelector("[draggable]") as HTMLElement;
    const targetColumn = screen.getByText("In Progress").closest("div") as HTMLElement;
    const transfer = dataTransfer();

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(targetColumn, { dataTransfer: transfer });
    fireEvent.drop(targetColumn, { dataTransfer: transfer });

    await waitFor(() =>
      expect(mockedMoveList).toHaveBeenCalledWith("agency-1", "project-1", "list-todo", 1),
    );
  });

  it("does not call moveTaskListAction when a column is dropped on itself", async () => {
    renderBoard();

    const todoHeader = screen.getByText("To Do").closest("div") as HTMLElement;
    const handle = todoHeader.querySelector("[draggable]") as HTMLElement;
    const ownColumn = screen.getByText("To Do").closest("div") as HTMLElement;
    const transfer = dataTransfer();

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.drop(ownColumn, { dataTransfer: transfer });

    expect(mockedMoveList).not.toHaveBeenCalled();
  });
});

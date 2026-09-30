import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BoardWidget,
  boardProgress,
  FilesWidget,
  MyTasksWidget,
  OverviewWidget,
  TeamWidget,
} from "./ProjectDashboardWidgets";

const task = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `Task ${id}`,
  assignee_id: null,
  due_date: null,
  ...overrides,
});

const board = [
  { id: "l1", name: "To Do", tasks: [task("a", { assignee_id: "me" }), task("b")] },
  { id: "l2", name: "In Progress", tasks: [task("c", { assignee_id: "me", due_date: "2000-01-01" })] },
  { id: "l3", name: "Done", tasks: [task("d", { assignee_id: "me" })] },
] as never;

const project = {
  id: "p1",
  client_id: "c1",
  client_name: "Acme",
  start_date: "2026-01-05",
  due_date: null,
  member_count: 3,
  description: "Rebuild the marketing site.",
} as never;

describe("boardProgress", () => {
  it("counts tasks in the last list as done", () => {
    expect(boardProgress(board)).toEqual({ done: 1, total: 4 });
    expect(boardProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("OverviewWidget", () => {
  it("shows the client, team size, progress, and description", () => {
    render(<OverviewWidget project={project} board={board} />);
    expect(screen.getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/clients/c1");
    expect(screen.getByText("3 people")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 tasks done · 25%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("Rebuild the marketing site.")).toBeInTheDocument();
    expect(screen.queryByText("Deadline")).not.toBeInTheDocument();
  });
});

describe("MyTasksWidget", () => {
  it("lists only my open tasks, soonest due first, flagging overdue ones", () => {
    render(<MyTasksWidget projectId="p1" board={board} userId="me" />);
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toHaveLength(2); // "d" is done, "b" isn't mine
    expect(items[0]).toContain("Task c");
    expect(items[0]).toContain("overdue");
    expect(items[1]).toContain("Task a");
  });

  it("has an empty state", () => {
    render(<MyTasksWidget projectId="p1" board={board} userId="someone-else" />);
    expect(screen.getByText(/Nothing assigned to you/)).toBeInTheDocument();
  });
});

describe("BoardWidget", () => {
  it("shows each list's count", () => {
    render(<BoardWidget board={board} />);
    expect(screen.getByText("To Do").parentElement).toHaveTextContent("2");
  });
});

describe("TeamWidget", () => {
  it("shows roles, or 'No role'", () => {
    const members = [
      { id: "m1", full_name: "Ann Lee", role_name: "Designer", role_color: "#7c3aed" },
      { id: "m2", full_name: "Bo Kim", role_name: null, role_color: null },
    ] as never;
    render(<TeamWidget members={members} />);
    expect(screen.getByText("Designer")).toBeInTheDocument();
    expect(screen.getByText("No role")).toBeInTheDocument();
  });
});

describe("FilesWidget", () => {
  it("caps the list and links to the rest", () => {
    const files = Array.from({ length: 7 }, (_, index) => ({ id: `f${index}`, file_name: `file-${index}.pdf` })) as never;
    render(<FilesWidget projectId="p1" files={files} limit={5} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "+2 more" })).toHaveAttribute("href", "/projects/p1/files");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PortalTaskList } from "@/lib/portal";
import PortalTaskBoard from "./PortalTaskBoard";

const columns: PortalTaskList[] = [
  {
    id: "list-1",
    name: "To Do",
    position: 0,
    tasks: [
      { id: "task-1", title: "Design the homepage", description: "First pass on the hero section", due_date: null, position: 0 },
    ],
  },
  {
    id: "list-2",
    name: "In Progress",
    position: 1,
    tasks: [{ id: "task-2", title: "Build the nav", description: null, due_date: "2026-10-01", position: 0 }],
  },
  { id: "list-3", name: "Done", position: 2, tasks: [] },
];

describe("PortalTaskBoard", () => {
  it("renders every column with its name and task count", () => {
    render(<PortalTaskBoard columns={columns} />);

    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders each task's title and description", () => {
    render(<PortalTaskBoard columns={columns} />);

    expect(screen.getByText("Design the homepage")).toBeInTheDocument();
    expect(screen.getByText("First pass on the hero section")).toBeInTheDocument();
    expect(screen.getByText("Build the nav")).toBeInTheDocument();
  });

  it("shows a due date when the task has one", () => {
    render(<PortalTaskBoard columns={columns} />);
    expect(screen.getByText(/Due Oct 1/)).toBeInTheDocument();
  });

  it("shows a placeholder for an empty column", () => {
    render(<PortalTaskBoard columns={columns} />);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("shows an overall empty state when every column has no tasks", () => {
    render(
      <PortalTaskBoard
        columns={[
          { id: "list-1", name: "To Do", position: 0, tasks: [] },
          { id: "list-2", name: "Done", position: 1, tasks: [] },
        ]}
      />,
    );
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    expect(screen.queryByText("To Do")).not.toBeInTheDocument();
  });
});

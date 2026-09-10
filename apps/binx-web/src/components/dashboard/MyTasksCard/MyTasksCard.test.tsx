import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MyTask } from "@/lib/dashboard";
import MyTasksCard from "./MyTasksCard";

function task(overrides: Partial<MyTask>): MyTask {
  return {
    id: "t1",
    title: "Do the thing",
    due_date: null,
    project_id: "p1",
    project_name: "Alpha",
    client_name: "Acme",
    list_name: "In Progress",
    overdue: false,
    ...overrides,
  };
}

describe("MyTasksCard", () => {
  it("shows an empty state with no tasks", () => {
    render(<MyTasksCard tasks={[]} />);
    expect(screen.getByText(/Nothing assigned to you/)).toBeInTheDocument();
  });

  it("renders each task linking to its project board", () => {
    render(<MyTasksCard tasks={[task({ id: "t1", title: "Ship", project_id: "p9" })]} />);
    const link = screen.getByRole("link", { name: /Ship/ });
    expect(link).toHaveAttribute("href", "/projects/p9/board");
    expect(screen.getByText("Alpha · In Progress")).toBeInTheDocument();
  });

  it("flags an overdue task", () => {
    render(<MyTasksCard tasks={[task({ due_date: "2020-01-01", overdue: true })]} />);
    const link = screen.getByRole("link", { name: /Do the thing/ });
    expect(link).toHaveAttribute("data-overdue", "true");
    expect(screen.getByText(/overdue/)).toBeInTheDocument();
  });

  it("caps the list and links the remainder to My work", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task({ id: `t${i}`, title: `Task ${i}` }));
    render(<MyTasksCard tasks={tasks} limit={3} />);
    expect(screen.getAllByRole("link", { name: /^Task/ })).toHaveLength(3);
    expect(screen.getByRole("link", { name: "+5 more" })).toHaveAttribute("href", "/dashboard/my-work");
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import ProjectsTable from "./ProjectsTable";

const project = (over: Record<string, unknown>) =>
  ({
    id: String(over.name),
    name: "P",
    client_name: "Client",
    status: "active",
    description: null,
    start_date: null,
    due_date: null,
    member_count: 1,
    ...over,
  }) as never;

const projects = [
  project({ name: "Website Redesign", client_name: "Acme", status: "active" }),
  project({ name: "Brand Guide", client_name: "Beta", status: "planning" }),
  project({ name: "Old Site", client_name: "Acme", status: "completed", start_date: "2026-01-01", due_date: "2026-02-01" }),
];

describe("ProjectsTable", () => {
  it("renders the empty state when there are no projects", () => {
    render(<ProjectsTable projects={[]} />);
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
  });

  it("renders every project as a row inside the scroll wrapper", () => {
    const { container } = render(<ProjectsTable projects={projects} />);
    expect(container.querySelector('[class*="tableScroll"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: /Website Redesign/ })).toHaveAttribute("href", "/projects/Website Redesign");
    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3
  });

  it("filters by the status tabs", async () => {
    render(<ProjectsTable projects={projects} />);
    await userEvent.click(screen.getByRole("tab", { name: /Planning/ }));
    expect(screen.getByText("Brand Guide")).toBeInTheDocument();
    expect(screen.queryByText("Website Redesign")).toBeNull();
  });

  it("searches by project or client name", async () => {
    render(<ProjectsTable projects={projects} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search projects" }), "acme");
    expect(screen.getByText("Website Redesign")).toBeInTheDocument();
    expect(screen.getByText("Old Site")).toBeInTheDocument();
    expect(screen.queryByText("Brand Guide")).toBeNull();
  });

  it("shows a no-match state when the filter matches nothing", async () => {
    render(<ProjectsTable projects={projects} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search projects" }), "zzz");
    expect(screen.getByText("No matching projects")).toBeInTheDocument();
  });

  it("shows the All tab count", () => {
    render(<ProjectsTable projects={projects} />);
    expect(within(screen.getByRole("tab", { name: /^All/ })).getByText("3")).toBeInTheDocument();
  });
});

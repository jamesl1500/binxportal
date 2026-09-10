import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The individual panels are exercised by their own tests — stub them so this
// suite focuses on the sub-tab switching.
vi.mock("@/components/forms/projects/ProjectForm/ProjectForm", () => ({
  default: () => <div>project form</div>,
}));
vi.mock("@/components/forms/projects/ProjectLabelsPanel/ProjectLabelsPanel", () => ({
  default: ({ kind }: { kind: string }) => <div>{kind} labels panel</div>,
}));
vi.mock("@/components/forms/projects/DeleteProjectForm/DeleteProjectForm", () => ({
  default: () => <div>delete project form</div>,
}));

import type { AgencyClient } from "@/lib/clients";
import type { Project, ProjectRole, ProjectTag } from "@/lib/projects";

import ProjectSettingsTabs from "./ProjectSettingsTabs";

const project = { id: "project-1", name: "Redesign" } as Project;
const clients: AgencyClient[] = [];
const roles: ProjectRole[] = [];
const tags: ProjectTag[] = [];

function renderTabs() {
  return render(
    <ProjectSettingsTabs agencyId="agency-1" project={project} clients={clients} roles={roles} tags={tags} />,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/projects/project-1/settings");
});

describe("ProjectSettingsTabs", () => {
  it("shows the Details panel by default", () => {
    renderTabs();

    expect(screen.getByText("project form")).toBeInTheDocument();
    expect(screen.queryByText("role labels panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("aria-current", "page");
  });

  it("switches panels when a nav item is clicked and reflects it in the hash", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("button", { name: "Member roles" }));

    expect(screen.getByText("role labels panel")).toBeInTheDocument();
    expect(screen.queryByText("project form")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#roles");
  });

  it("shows the danger zone panel with the delete form", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("button", { name: "Danger zone" }));

    expect(screen.getByText("delete project form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
  });

  it("opens on the section named by the URL hash", () => {
    window.history.replaceState(null, "", "/projects/project-1/settings#tags");
    renderTabs();

    expect(screen.getByText("tag labels panel")).toBeInTheDocument();
  });
});

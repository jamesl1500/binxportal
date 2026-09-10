import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockedRefresh }),
}));

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  createProjectRoleAction: vi.fn(),
  updateProjectRoleAction: vi.fn(),
  deleteProjectRoleAction: vi.fn(),
  createProjectTagAction: vi.fn(),
  updateProjectTagAction: vi.fn(),
  deleteProjectTagAction: vi.fn(),
}));

import {
  createProjectRoleAction,
  createProjectTagAction,
  deleteProjectRoleAction,
  updateProjectRoleAction,
} from "@/app/(app)/projects/[projectId]/actions";
import type { ProjectRole } from "@/lib/projects";

import ProjectLabelsPanel from "./ProjectLabelsPanel";

const mockedCreateRole = vi.mocked(createProjectRoleAction);
const mockedUpdateRole = vi.mocked(updateProjectRoleAction);
const mockedDeleteRole = vi.mocked(deleteProjectRoleAction);
const mockedCreateTag = vi.mocked(createProjectTagAction);

const roles: ProjectRole[] = [{ id: "role-pm", project_id: "project-1", name: "Project Manager", color: "#2563eb" }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectLabelsPanel", () => {
  it("renders existing roles and the copy for the role kind", () => {
    render(<ProjectLabelsPanel agencyId="agency-1" projectId="project-1" kind="role" labels={roles} />);

    expect(screen.getByText("Project Manager")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add role" })).toBeInTheDocument();
  });

  it("shows a tag-specific empty state when there are none", () => {
    render(<ProjectLabelsPanel agencyId="agency-1" projectId="project-1" kind="tag" labels={[]} />);

    expect(screen.getByText(/No tags yet/i)).toBeInTheDocument();
  });

  it("creates a new role with the chosen name and colour", async () => {
    mockedCreateRole.mockResolvedValueOnce({
      role: { id: "role-dev", project_id: "project-1", name: "Web Developer", color: "#16a34a" },
    });
    const user = userEvent.setup();
    render(<ProjectLabelsPanel agencyId="agency-1" projectId="project-1" kind="role" labels={roles} />);

    await user.type(screen.getByLabelText("New role name"), "Web Developer");
    await user.click(screen.getByRole("radio", { name: "#16a34a" }));
    await user.click(screen.getByRole("button", { name: "Add role" }));

    expect(mockedCreateRole).toHaveBeenCalledWith("agency-1", "project-1", "Web Developer", "#16a34a");
    expect(await screen.findByText("Web Developer")).toBeInTheDocument();
  });

  it("creates a tag via the tag action, not the role action", async () => {
    mockedCreateTag.mockResolvedValueOnce({
      tag: { id: "tag-bug", project_id: "project-1", name: "Bug", color: "#dc2626" },
    });
    const user = userEvent.setup();
    render(<ProjectLabelsPanel agencyId="agency-1" projectId="project-1" kind="tag" labels={[]} />);

    await user.type(screen.getByLabelText("New tag name"), "Bug");
    await user.click(screen.getByRole("button", { name: "Add tag" }));

    expect(mockedCreateTag).toHaveBeenCalledWith("agency-1", "project-1", "Bug", "#6e6e76");
    expect(mockedCreateRole).not.toHaveBeenCalled();
  });

  it("renames a role inline", async () => {
    mockedUpdateRole.mockResolvedValueOnce({
      role: { id: "role-pm", project_id: "project-1", name: "Delivery Lead", color: "#2563eb" },
    });
    const user = userEvent.setup();
    render(<ProjectLabelsPanel agencyId="agency-1" projectId="project-1" kind="role" labels={roles} />);

    await user.click(screen.getByRole("button", { name: "Edit Project Manager" }));
    const input = screen.getByLabelText("role name");
    await user.clear(input);
    await user.type(input, "Delivery Lead");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedUpdateRole).toHaveBeenCalledWith("agency-1", "project-1", "role-pm", "Delivery Lead", "#2563eb");
  });

  it("deletes a role after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedDeleteRole.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ProjectLabelsPanel agencyId="agency-1" projectId="project-1" kind="role" labels={roles} />);

    await user.click(screen.getByRole("button", { name: "Delete Project Manager" }));

    expect(mockedDeleteRole).toHaveBeenCalledWith("agency-1", "project-1", "role-pm");
    expect(screen.queryByText("Project Manager")).not.toBeInTheDocument();
  });

  it("surfaces a server error", async () => {
    mockedCreateRole.mockResolvedValueOnce({ error: "A role with this name already exists" });
    const user = userEvent.setup();
    render(<ProjectLabelsPanel agencyId="agency-1" projectId="project-1" kind="role" labels={roles} />);

    await user.type(screen.getByLabelText("New role name"), "Project Manager");
    await user.click(screen.getByRole("button", { name: "Add role" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A role with this name already exists");
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockedRefresh }),
}));

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  addProjectMemberAction: vi.fn(),
  assignProjectMemberRoleAction: vi.fn(),
  removeProjectMemberAction: vi.fn(),
}));

import {
  addProjectMemberAction,
  assignProjectMemberRoleAction,
  removeProjectMemberAction,
} from "@/app/(app)/projects/[projectId]/actions";
import type { AgencyMember } from "@/lib/agencies";
import type { ProjectMember, ProjectRole } from "@/lib/projects";

import ProjectTeamTable from "./ProjectTeamTable";

const mockedAdd = vi.mocked(addProjectMemberAction);
const mockedAssignRole = vi.mocked(assignProjectMemberRoleAction);
const mockedRemove = vi.mocked(removeProjectMemberAction);

const roles: ProjectRole[] = [
  { id: "role-pm", project_id: "project-1", name: "Project Manager", color: "#2563eb" },
  { id: "role-dev", project_id: "project-1", name: "Web Developer", color: "#16a34a" },
];

const members: ProjectMember[] = [
  {
    id: "member-zoe",
    project_id: "project-1",
    user_id: "user-zoe",
    full_name: "Zoe Adams",
    email: "zoe@example.com",
    job_title: "Designer",
    role_id: null,
    role_name: null,
    role_color: null,
  },
  {
    id: "member-abe",
    project_id: "project-1",
    user_id: "user-abe",
    full_name: "Abe Brown",
    email: "abe@example.com",
    job_title: "Engineer",
    role_id: "role-dev",
    role_name: "Web Developer",
    role_color: "#16a34a",
  },
];

const agencyMemberExtras = {
  user_name: "member",
  title: null,
  phone: null,
  bio: null,
  is_verified: true,
  last_active_at: null,
  admin_notes: null,
};

const agencyMembers: AgencyMember[] = [
  ...members.map((member) => ({
    id: `agency-${member.user_id}`,
    agency_id: "agency-1",
    user_id: member.user_id,
    role: "member" as const,
    full_name: member.full_name,
    email: member.email,
    job_title: member.job_title,
    joined_at: "2026-01-01T00:00:00Z",
    ...agencyMemberExtras,
  })),
  {
    id: "agency-user-cass",
    agency_id: "agency-1",
    user_id: "user-cass",
    role: "member" as const,
    full_name: "Cass Green",
    email: "cass@example.com",
    job_title: null,
    joined_at: "2026-01-01T00:00:00Z",
    ...agencyMemberExtras,
  },
];

function renderTable() {
  return render(
    <ProjectTeamTable
      agencyId="agency-1"
      projectId="project-1"
      members={members}
      agencyMembers={agencyMembers}
      roles={roles}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectTeamTable", () => {
  it("lists each assigned member with their contact and role", () => {
    renderTable();

    expect(screen.getByText("Zoe Adams")).toBeInTheDocument();
    expect(screen.getByText("abe@example.com")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Project role for Abe Brown") as HTMLSelectElement).value,
    ).toBe("role-dev");
  });

  it("filters rows by the search box", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.type(screen.getByLabelText("Search team"), "abe");

    expect(screen.getByText("Abe Brown")).toBeInTheDocument();
    expect(screen.queryByText("Zoe Adams")).not.toBeInTheDocument();
  });

  it("sorts by name and reverses on a second click", async () => {
    const user = userEvent.setup();
    renderTable();

    const nameOrder = () =>
      screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);

    // Default ascending: Abe before Zoe.
    expect(nameOrder()[0]).toContain("Abe Brown");

    await user.click(screen.getByRole("button", { name: /member/i }));
    expect(nameOrder()[0]).toContain("Zoe Adams");
  });

  it("assigns a role via the per-row select", async () => {
    mockedAssignRole.mockResolvedValueOnce({ member: { ...members[0], role_id: "role-pm" } });
    const user = userEvent.setup();
    renderTable();

    await user.selectOptions(screen.getByLabelText("Project role for Zoe Adams"), "role-pm");

    expect(mockedAssignRole).toHaveBeenCalledWith("agency-1", "project-1", "member-zoe", "role-pm");
    expect(mockedRefresh).toHaveBeenCalled();
  });

  it("removes a member after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockedRemove.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderTable();

    const abeRow = screen.getByText("Abe Brown").closest("tr")!;
    await user.click(within(abeRow).getByRole("button", { name: "Remove" }));

    expect(mockedRemove).toHaveBeenCalledWith("agency-1", "project-1", "member-abe");
  });

  it("assigns an unassigned agency teammate to the project", async () => {
    mockedAdd.mockResolvedValueOnce({
      member: {
        id: "member-cass",
        project_id: "project-1",
        user_id: "user-cass",
        full_name: "Cass Green",
        email: "cass@example.com",
        job_title: null,
        role_id: null,
        role_name: null,
        role_color: null,
      },
    });
    const user = userEvent.setup();
    renderTable();

    await user.selectOptions(screen.getByLabelText("Assign a team member"), "user-cass");
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(mockedAdd).toHaveBeenCalledWith("agency-1", "project-1", "user-cass");
  });
});

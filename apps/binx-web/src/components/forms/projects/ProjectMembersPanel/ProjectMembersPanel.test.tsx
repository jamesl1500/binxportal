import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  addProjectMemberAction: vi.fn(),
  removeProjectMemberAction: vi.fn(),
}));

import { addProjectMemberAction, removeProjectMemberAction } from "@/app/(app)/projects/[projectId]/actions";
import ProjectMembersPanel from "./ProjectMembersPanel";

const add = vi.mocked(addProjectMemberAction);
const remove = vi.mocked(removeProjectMemberAction);

const members = [{ id: "m1", user_id: "u1", full_name: "Ada Lovelace", email: "ada@x.test", job_title: "Lead" }] as never;
const agencyMembers = [
  { user_id: "u1", full_name: "Ada Lovelace" },
  { user_id: "u2", full_name: "Alan Turing" },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  add.mockResolvedValue({} as never);
  remove.mockResolvedValue({} as never);
});

describe("ProjectMembersPanel", () => {
  it("lists assigned members and offers only the unassigned in the picker", () => {
    render(<ProjectMembersPanel agencyId="a1" projectId="p1" members={members} agencyMembers={agencyMembers} />);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: "Assign a team member" });
    expect(picker).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alan Turing" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Ada Lovelace" })).toBeNull();
  });

  it("shows the empty state with no members", () => {
    render(<ProjectMembersPanel agencyId="a1" projectId="p1" members={[]} agencyMembers={agencyMembers} />);
    expect(screen.getByText(/no one is assigned/i)).toBeInTheDocument();
  });

  it("assigns the picked teammate", async () => {
    render(<ProjectMembersPanel agencyId="a1" projectId="p1" members={members} agencyMembers={agencyMembers} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Assign a team member" }), "u2");
    await userEvent.click(screen.getByRole("button", { name: "Assign" }));
    expect(add).toHaveBeenCalledWith("a1", "p1", "u2");
    expect(refresh).toHaveBeenCalled();
  });

  it("removes a member", async () => {
    render(<ProjectMembersPanel agencyId="a1" projectId="p1" members={members} agencyMembers={agencyMembers} />);
    await userEvent.click(screen.getByRole("button", { name: /Remove Ada Lovelace/ }));
    expect(remove).toHaveBeenCalledWith("a1", "p1", "m1");
  });

  it("surfaces an add error", async () => {
    add.mockResolvedValueOnce({ error: "Already assigned" } as never);
    render(<ProjectMembersPanel agencyId="a1" projectId="p1" members={members} agencyMembers={agencyMembers} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Assign a team member" }), "u2");
    await userEvent.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Already assigned");
  });
});

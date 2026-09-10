import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/team/actions", () => ({
  updateAgencyMemberRoleAction: vi.fn(),
  updateMemberDetailsAction: vi.fn(),
  removeAgencyMemberAction: vi.fn(),
}));

import { updateAgencyMemberRoleAction } from "@/app/(app)/team/actions";
import type { AgencyMember } from "@/lib/agencies";

import TeamRoster from "./TeamRoster";

const mockedRole = vi.mocked(updateAgencyMemberRoleAction);

function member(overrides: Partial<AgencyMember>): AgencyMember {
  return {
    id: "m-1",
    agency_id: "a-1",
    user_id: "u-1",
    role: "member",
    full_name: "Jane Doe",
    user_name: "jane",
    email: "jane@example.com",
    job_title: null,
    title: null,
    phone: null,
    bio: null,
    is_verified: true,
    last_active_at: "2026-08-01T00:00:00Z",
    joined_at: "2026-01-01T00:00:00Z",
    admin_notes: null,
    ...overrides,
  };
}

const members: AgencyMember[] = [
  member({
    id: "m-owner",
    user_id: "u-owner",
    role: "owner",
    full_name: "Olivia Owner",
    user_name: "olivia",
    email: "olivia@example.com",
  }),
  member({
    id: "m-admin",
    user_id: "u-admin",
    role: "admin",
    full_name: "Adam Admin",
    user_name: "adam",
    email: "adam@example.com",
  }),
  member({ id: "m-1", user_id: "u-1", role: "member", full_name: "Jane Doe", user_name: "jane", email: "jane@example.com" }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamRoster", () => {
  it("filters rows by the search term", async () => {
    const user = userEvent.setup();
    render(<TeamRoster agencyId="a-1" members={members} currentUserId="u-owner" canManage />);

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Adam Admin")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search members"), "jane");

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Adam Admin")).not.toBeInTheDocument();
  });

  it("filters rows by the role chip", async () => {
    const user = userEvent.setup();
    render(<TeamRoster agencyId="a-1" members={members} currentUserId="u-owner" canManage />);

    await user.click(screen.getByRole("button", { name: "Admins" }));

    expect(screen.getByText("Adam Admin")).toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    expect(screen.queryByText("Olivia Owner")).not.toBeInTheDocument();
  });

  it("opens the detail drawer when a row is clicked", async () => {
    const user = userEvent.setup();
    render(<TeamRoster agencyId="a-1" members={members} currentUserId="u-owner" canManage />);

    await user.click(screen.getByRole("button", { name: "Open Jane Doe" }));

    expect(await screen.findByRole("dialog", { name: "Member: Jane Doe" })).toBeInTheDocument();
  });

  it("calls the role action when the inline select changes", async () => {
    mockedRole.mockResolvedValueOnce({ member: member({ id: "m-1", role: "admin" }) });
    const user = userEvent.setup();
    render(<TeamRoster agencyId="a-1" members={members} currentUserId="u-owner" canManage />);

    const janeRow = screen.getByRole("button", { name: "Open Jane Doe" });
    await user.selectOptions(within(janeRow).getByLabelText("Role for Jane Doe"), "admin");

    expect(mockedRole).toHaveBeenCalledWith("a-1", "m-1", "admin");
  });

  it("hides the inline role select for the caller's own row", () => {
    render(<TeamRoster agencyId="a-1" members={members} currentUserId="u-owner" canManage />);

    const ownRow = screen.getByRole("button", { name: "Open Olivia Owner" });
    expect(within(ownRow).queryByLabelText("Role for Olivia Owner")).not.toBeInTheDocument();
  });
});

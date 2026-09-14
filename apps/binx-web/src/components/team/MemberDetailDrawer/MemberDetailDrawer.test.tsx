import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/team/actions", () => ({
  updateAgencyMemberRoleAction: vi.fn(),
  updateMemberDetailsAction: vi.fn(),
  removeAgencyMemberAction: vi.fn(),
}));

import { removeAgencyMemberAction, updateMemberDetailsAction } from "@/app/(app)/team/actions";
import type { AgencyMember } from "@/lib/agencies";

import MemberDetailDrawer from "./MemberDetailDrawer";

const mockedDetails = vi.mocked(updateMemberDetailsAction);
const mockedRemove = vi.mocked(removeAgencyMemberAction);

function member(overrides: Partial<AgencyMember> = {}): AgencyMember {
  return {
    id: "m-1",
    agency_id: "a-1",
    user_id: "u-1",
    role: "member",
    full_name: "Jane Doe",
    user_name: "jane",
    email: "jane@example.com",
    job_title: "Producer",
    title: null,
    phone: null,
    bio: "Loves typography.",
    is_verified: true,
    last_active_at: "2026-08-01T00:00:00Z",
    joined_at: "2026-01-01T00:00:00Z",
    admin_notes: null,
    has_avatar: false,
    avatar_version: null,
    has_cover: false,
    cover_version: null,
    skills: [],
    experience: [],
    education: [],
    ...overrides,
  };
}

function renderDrawer(props: Partial<React.ComponentProps<typeof MemberDetailDrawer>> = {}) {
  return render(
    <MemberDetailDrawer
      agencyId="a-1"
      member={member()}
      open
      canManage
      currentUserId="u-owner"
      onOpenChange={vi.fn()}
      onClosed={vi.fn()}
      onMemberUpdated={vi.fn()}
      onMemberRemoved={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MemberDetailDrawer", () => {
  it("saves the agency title + notes with the camelCase payload", async () => {
    mockedDetails.mockResolvedValueOnce({ member: member({ title: "Lead Designer", admin_notes: "great" }) });
    const onMemberUpdated = vi.fn();
    const user = userEvent.setup();
    renderDrawer({ onMemberUpdated });

    await user.type(screen.getByLabelText("Job title at this agency"), "Lead Designer");
    await user.type(screen.getByLabelText("Admin notes"), "great");
    await user.click(screen.getByRole("button", { name: "Save details" }));

    expect(mockedDetails).toHaveBeenCalledWith("a-1", "m-1", { title: "Lead Designer", adminNotes: "great" });
    expect(onMemberUpdated).toHaveBeenCalled();
  });

  it("asks for confirmation before removing, then calls the action", async () => {
    mockedRemove.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole("button", { name: /Remove from agency/ }));
    expect(mockedRemove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(mockedRemove).toHaveBeenCalledWith("a-1", "m-1");
  });

  it("hides Role, Agency details and Remove on the caller's own row", () => {
    renderDrawer({ member: member({ user_id: "u-owner" }) });

    expect(screen.queryByLabelText("Role for Jane Doe")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Admin notes")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove from agency/ })).not.toBeInTheDocument();
  });

  it("does not show admin-only controls when canManage is false", () => {
    renderDrawer({ canManage: false });

    expect(screen.queryByLabelText("Admin notes")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Role for Jane Doe")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefresh = vi.fn();

vi.mock("@/app/(app)/team/actions", () => ({
  inviteMemberAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { inviteMemberAction } from "@/app/(app)/team/actions";

import InviteMemberForm from "./InviteMemberForm";

const mockedInviteMemberAction = vi.mocked(inviteMemberAction);
const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InviteMemberForm", () => {
  it("shows a validation error instead of submitting for an invalid email", async () => {
    const user = userEvent.setup();
    render(<InviteMemberForm agencyId={agencyId} />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(mockedInviteMemberAction).not.toHaveBeenCalled();
  });

  it("submits the trimmed email and selected role, then resets and refreshes on success", async () => {
    mockedInviteMemberAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<InviteMemberForm agencyId={agencyId} />);

    await user.type(screen.getByLabelText("Email"), "  new-hire@example.com  ");
    await user.selectOptions(screen.getByLabelText("Role"), "admin");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText("Invitation sent to new-hire@example.com.")).toBeInTheDocument();
    expect(mockedInviteMemberAction).toHaveBeenCalledWith(agencyId, "new-hire@example.com", "admin");
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("shows the server error on failure without refreshing", async () => {
    mockedInviteMemberAction.mockResolvedValueOnce({ error: "That person is already a member of this agency" });
    const user = userEvent.setup();
    render(<InviteMemberForm agencyId={agencyId} />);

    await user.type(screen.getByLabelText("Email"), "existing@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByText("That person is already a member of this agency")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

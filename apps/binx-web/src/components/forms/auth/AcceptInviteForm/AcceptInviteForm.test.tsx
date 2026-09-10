import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/auth/accept-invite/actions", () => ({
  acceptInviteAction: vi.fn(),
}));

import { acceptInviteAction } from "@/app/(auth)/auth/accept-invite/actions";
import type { AgencyInvitationPreview } from "@/lib/agencies";

import AcceptInviteForm from "./AcceptInviteForm";

const mockedAcceptInviteAction = vi.mocked(acceptInviteAction);

const preview: AgencyInvitationPreview = {
  agency_name: "Acme Agency",
  role: "member",
  invited_by_name: "Jane Doe",
  email: "new-hire@example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AcceptInviteForm", () => {
  it("renders the invitation's agency, role, and inviter", () => {
    render(<AcceptInviteForm token="raw-token" preview={preview} />);

    expect(screen.getByText("Acme Agency")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Acme Agency" })).toBeInTheDocument();
  });

  it("accepts the invite using the token from the link", async () => {
    // A successful accept redirects server-side and never resolves back to
    // an object here — this test only asserts the action was called correctly.
    mockedAcceptInviteAction.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<AcceptInviteForm token="raw-token" preview={preview} />);

    await user.click(screen.getByRole("button", { name: "Join Acme Agency" }));

    expect(mockedAcceptInviteAction).toHaveBeenCalledWith("raw-token");
  });

  it("shows the server error when accepting fails", async () => {
    mockedAcceptInviteAction.mockResolvedValueOnce({
      error: "This invitation was sent to a different email address",
    });
    const user = userEvent.setup();
    render(<AcceptInviteForm token="raw-token" preview={preview} />);

    await user.click(screen.getByRole("button", { name: "Join Acme Agency" }));

    expect(await screen.findByText("This invitation was sent to a different email address")).toBeInTheDocument();
  });
});

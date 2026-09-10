import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/team/actions", () => ({
  resendInvitationAction: vi.fn(),
  revokeAgencyInvitationAction: vi.fn(),
  getInvitationHistoryAction: vi.fn(),
}));

import {
  getInvitationHistoryAction,
  resendInvitationAction,
  revokeAgencyInvitationAction,
} from "@/app/(app)/team/actions";
import type { AgencyInvitation } from "@/lib/agencies";

import InvitationsPanel from "./InvitationsPanel";

const mockedResend = vi.mocked(resendInvitationAction);
const mockedRevoke = vi.mocked(revokeAgencyInvitationAction);
const mockedHistory = vi.mocked(getInvitationHistoryAction);

function invite(overrides: Partial<AgencyInvitation> = {}): AgencyInvitation {
  return {
    id: "i-1",
    agency_id: "a-1",
    email: "new@example.com",
    role: "member",
    status: "pending",
    invited_by_name: "Olivia Owner",
    created_at: "2026-08-01T00:00:00Z",
    expires_at: "2026-09-01T00:00:00Z",
    is_expired: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InvitationsPanel", () => {
  it("reveals a copy-able accept link after a resend", async () => {
    mockedResend.mockResolvedValueOnce({
      invitation: invite({ accept_url: "https://app.test/auth/accept-invite?token=fresh" }),
    });
    const user = userEvent.setup();
    render(<InvitationsPanel agencyId="a-1" invitations={[invite()]} />);

    const row = screen.getByRole("row", { name: /new@example.com/ });
    expect(within(row).getByRole("button", { name: /Copy link/ })).toBeDisabled();

    await user.click(within(row).getByRole("button", { name: /Resend/ }));

    expect(mockedResend).toHaveBeenCalledWith("a-1", "i-1");
    expect(await screen.findByText("https://app.test/auth/accept-invite?token=fresh")).toBeInTheDocument();
  });

  it("removes the row when an invitation is revoked", async () => {
    mockedRevoke.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<InvitationsPanel agencyId="a-1" invitations={[invite()]} />);

    await user.click(screen.getByRole("button", { name: /Revoke/ }));

    expect(mockedRevoke).toHaveBeenCalledWith("a-1", "i-1");
    expect(await screen.findByText("No pending invitations.")).toBeInTheDocument();
  });

  it("loads the accepted/revoked history when the toggle is opened", async () => {
    mockedHistory.mockResolvedValueOnce({
      invitations: [
        invite({ id: "i-old", email: "gone@example.com", status: "revoked" }),
        invite({ id: "i-1", status: "pending" }),
      ],
    });
    const user = userEvent.setup();
    render(<InvitationsPanel agencyId="a-1" invitations={[invite()]} />);

    await user.click(screen.getByRole("button", { name: /accepted & revoked/i }));

    expect(mockedHistory).toHaveBeenCalledWith("a-1");
    expect(await screen.findByText("gone@example.com")).toBeInTheDocument();
  });

  it("shows an Expired badge for a stale invitation", () => {
    render(<InvitationsPanel agencyId="a-1" invitations={[invite({ is_expired: true })]} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/clients/[clientId]/settings/actions", () => ({
  inviteClientContactAction: vi.fn(),
  resendClientContactInvitationAction: vi.fn(),
  revokeClientContactInvitationAction: vi.fn(),
  removeClientContactAction: vi.fn(),
}));

import {
  inviteClientContactAction,
  revokeClientContactInvitationAction,
} from "@/app/(app)/clients/[clientId]/settings/actions";
import type { ClientContact, ClientContactInvitation } from "@/lib/clients";

import PortalContactsPanel from "./PortalContactsPanel";

const mockedInvite = vi.mocked(inviteClientContactAction);
const mockedRevoke = vi.mocked(revokeClientContactInvitationAction);

const contact: ClientContact = {
  id: "ct1",
  user_id: "u1",
  full_name: "Casey Client",
  email: "casey@northwind.example",
  title: "Ops lead",
  is_primary: true,
  joined_at: "2026-09-01T00:00:00Z",
};

const invitation: ClientContactInvitation = {
  id: "inv1",
  client_id: "c1",
  agency_id: "a1",
  email: "pending@northwind.example",
  status: "pending",
  invited_by_name: "Olivia Owner",
  created_at: "2026-09-02T00:00:00Z",
  expires_at: "2026-09-09T00:00:00Z",
  is_expired: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PortalContactsPanel", () => {
  it("lists contacts and pending invitations", () => {
    render(
      <PortalContactsPanel agencyId="a1" clientId="c1" contacts={[contact]} invitations={[invitation]} />,
    );
    expect(screen.getByText("Casey Client")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("pending@northwind.example")).toBeInTheDocument();
  });

  it("invites by email", async () => {
    mockedInvite.mockResolvedValueOnce({ invitation });
    const user = userEvent.setup();
    render(<PortalContactsPanel agencyId="a1" clientId="c1" contacts={[]} invitations={[]} />);

    await user.type(screen.getByLabelText("Contact email"), "new@northwind.example");
    await user.click(screen.getByRole("button", { name: "Invite" }));

    expect(mockedInvite).toHaveBeenCalledWith("a1", "c1", "new@northwind.example", null);
  });

  it("revokes a pending invitation", async () => {
    mockedRevoke.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<PortalContactsPanel agencyId="a1" clientId="c1" contacts={[]} invitations={[invitation]} />);

    await user.click(screen.getByRole("button", { name: /Revoke/ }));
    expect(mockedRevoke).toHaveBeenCalledWith("a1", "c1", "inv1");
  });
});

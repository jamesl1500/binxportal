import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/clients/actions", () => ({
  createClientAction: vi.fn(),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { createClientAction } from "@/app/(app)/clients/actions";

import NewClientForm from "./NewClientForm";

const mockedCreate = vi.mocked(createClientAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NewClientForm", () => {
  it("renders the client form with no cancel button", () => {
    render(<NewClientForm agencyId={agencyId} canManagePortal />);

    expect(screen.getByLabelText("Client name")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });

  async function createClient(canManagePortal: boolean) {
    mockedCreate.mockResolvedValueOnce({
      client: {
        id: "cccccccc-3333-3333-3333-333333333333",
        agency_id: agencyId,
        name: "Acme Co",
        slug: "acme-co",
        is_active: true,
        primary_contact_name: null,
        primary_contact_email: null,
        primary_contact_phone: null,
        website: null,
        notes: null,
        billing_email: null,
        billing_address: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    });
    const user = userEvent.setup();
    render(<NewClientForm agencyId={agencyId} canManagePortal={canManagePortal} />);

    await user.type(screen.getByLabelText("Client name"), "Acme Co");
    await user.click(screen.getByRole("button", { name: /^create client$/i }));

    expect(mockedCreate).toHaveBeenCalledWith(agencyId, expect.objectContaining({ name: "Acme Co" }));
  }

  it("creates a client and sends an owner/admin on to portal setup", async () => {
    await createClient(true);

    expect(mockPush).toHaveBeenCalledWith(
      "/clients/new/portal-setup?clientId=cccccccc-3333-3333-3333-333333333333",
    );
  });

  it("sends a member who can't manage the portal straight to the client", async () => {
    await createClient(false);

    expect(mockPush).toHaveBeenCalledWith("/clients/cccccccc-3333-3333-3333-333333333333");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/clients/actions", () => ({
  createClientAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { createClientAction } from "@/app/(app)/clients/actions";

import CreateClientDialog from "./CreateClientDialog";

const mockedCreate = vi.mocked(createClientAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateClientDialog", () => {
  it("opens the dialog when New client is clicked", async () => {
    const user = userEvent.setup();
    render(<CreateClientDialog agencyId={agencyId} />);

    await user.click(screen.getByRole("button", { name: /new client/i }));

    expect(await screen.findByRole("heading", { name: "Add a new client" })).toBeInTheDocument();
  });

  it("creates a client and closes the dialog, refreshing the route", async () => {
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
        created_at: "2026-01-01T00:00:00Z",
      },
    });
    const user = userEvent.setup();
    render(<CreateClientDialog agencyId={agencyId} />);

    await user.click(screen.getByRole("button", { name: /new client/i }));
    await user.type(screen.getByLabelText("Client name"), "Acme Co");
    await user.click(screen.getByRole("button", { name: /^create client$/i }));

    expect(mockedCreate).toHaveBeenCalledWith(agencyId, expect.objectContaining({ name: "Acme Co" }));
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Add a new client" })).not.toBeInTheDocument();
  });

  it("closes the dialog without creating anything when cancelled", async () => {
    const user = userEvent.setup();
    render(<CreateClientDialog agencyId={agencyId} />);

    await user.click(screen.getByRole("button", { name: /new client/i }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("heading", { name: "Add a new client" })).not.toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

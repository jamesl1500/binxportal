import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/clients/actions", () => ({
  createClientAction: vi.fn(),
  updateClientAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { createClientAction, updateClientAction } from "@/app/(app)/clients/actions";
import type { AgencyClient } from "@/lib/clients";

import ClientForm from "./ClientForm";

const mockedCreate = vi.mocked(createClientAction);
const mockedUpdate = vi.mocked(updateClientAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";

const existingClient: AgencyClient = {
  id: "cccccccc-3333-3333-3333-333333333333",
  agency_id: agencyId,
  name: "Acme Co",
  slug: "acme-co",
  is_active: true,
  primary_contact_name: "Jamie Rivera",
  primary_contact_email: "jamie@acme.example",
  primary_contact_phone: "555-0100",
  website: "https://acme.example",
  notes: "Prefers email over calls.",
  created_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClientForm — create mode", () => {
  it("shows a validation error instead of submitting when the name is blank", async () => {
    const user = userEvent.setup();
    render(<ClientForm agencyId={agencyId} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create client/i }));

    expect(await screen.findByText("Client name is required")).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("submits the trimmed fields and reports the created client upward", async () => {
    mockedCreate.mockResolvedValueOnce({ client: existingClient });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<ClientForm agencyId={agencyId} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Client name"), "  Acme Co  ");
    await user.click(screen.getByRole("button", { name: /create client/i }));

    expect(mockedCreate).toHaveBeenCalledWith(agencyId, {
      name: "Acme Co",
      primaryContactName: null,
      primaryContactEmail: null,
      primaryContactPhone: null,
      website: null,
      notes: null,
      billingEmail: null,
      billingAddress: null,
    });
    expect(onSuccess).toHaveBeenCalledWith(existingClient);
  });

  it("shows the server error and does not report success", async () => {
    mockedCreate.mockResolvedValueOnce({ error: "Unable to create client" });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<ClientForm agencyId={agencyId} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Client name"), "Acme Co");
    await user.click(screen.getByRole("button", { name: /create client/i }));

    expect(await screen.findByText("Unable to create client")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ClientForm agencyId={agencyId} onSuccess={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not render a Cancel button when onCancel is omitted", () => {
    render(<ClientForm agencyId={agencyId} onSuccess={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });
});

describe("ClientForm — edit mode", () => {
  it("prefills every field from the given client", () => {
    render(<ClientForm agencyId={agencyId} client={existingClient} onSuccess={vi.fn()} />);

    expect(screen.getByLabelText("Client name")).toHaveValue("Acme Co");
    expect(screen.getByLabelText("Primary contact")).toHaveValue("Jamie Rivera");
    expect(screen.getByLabelText("Contact email")).toHaveValue("jamie@acme.example");
    expect(screen.getByLabelText("Contact phone")).toHaveValue("555-0100");
    expect(screen.getByLabelText("Website")).toHaveValue("https://acme.example");
    expect(screen.getByLabelText("Notes")).toHaveValue("Prefers email over calls.");
  });

  it("saves changes, shows an inline success message, and refreshes the route", async () => {
    const updated = { ...existingClient, name: "Acme Corp" };
    mockedUpdate.mockResolvedValueOnce({ client: updated });
    const user = userEvent.setup();
    render(<ClientForm agencyId={agencyId} client={existingClient} onSuccess={vi.fn()} />);

    await user.clear(screen.getByLabelText("Client name"));
    await user.type(screen.getByLabelText("Client name"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(mockedUpdate).toHaveBeenCalledWith(
      agencyId,
      existingClient.id,
      expect.objectContaining({ name: "Acme Corp" }),
    );
    expect(await screen.findByText("Client updated.")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("shows the server error on failure", async () => {
    mockedUpdate.mockResolvedValueOnce({ error: "Unable to update client" });
    const user = userEvent.setup();
    render(<ClientForm agencyId={agencyId} client={existingClient} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Unable to update client")).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

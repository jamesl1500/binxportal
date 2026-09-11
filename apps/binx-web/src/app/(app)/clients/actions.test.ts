import { beforeEach, describe, expect, it, vi } from "vitest";

// These actions only orchestrate: call the matching lib/clients function,
// translate a thrown AuthApiError into a returned { error }. We mock the lib
// calls so these tests prove the ORCHESTRATION is correct, without a real
// network call.
vi.mock("@/lib/clients", () => ({
  createAgencyClient: vi.fn(),
  updateAgencyClient: vi.fn(),
  setAgencyClientActive: vi.fn(),
  deleteAgencyClient: vi.fn(),
}));

// Next's real redirect() throws a special "NEXT_REDIRECT" error internally
// that the framework catches further up to actually perform the navigation.
// We mimic that "redirect = throw" behavior with our own sentinel error so we
// can assert on `.rejects.toThrow(...)` instead of needing a full Next runtime.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { createAgencyClient, deleteAgencyClient, setAgencyClientActive, updateAgencyClient } from "@/lib/clients";
import { createClientAction, deleteClientAction, setClientActiveAction, updateClientAction } from "./actions";

const mockedCreate = vi.mocked(createAgencyClient);
const mockedUpdate = vi.mocked(updateAgencyClient);
const mockedSetActive = vi.mocked(setAgencyClientActive);
const mockedDelete = vi.mocked(deleteAgencyClient);
const mockedRedirect = vi.mocked(redirect);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";
const client = {
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
};

const input = {
  name: "Acme Co",
  primaryContactName: null,
  primaryContactEmail: null,
  primaryContactPhone: null,
  website: null,
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createClientAction", () => {
  it("returns the created client on success", async () => {
    mockedCreate.mockResolvedValueOnce(client);

    await expect(createClientAction(agencyId, input)).resolves.toEqual({ client });
    expect(mockedCreate).toHaveBeenCalledWith(agencyId, input);
  });

  it("returns the upstream error message on failure", async () => {
    mockedCreate.mockRejectedValueOnce(new AuthApiError("Client name is required", 422));

    await expect(createClientAction(agencyId, input)).resolves.toEqual({ error: "Client name is required" });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedCreate.mockRejectedValueOnce(new Error("network down"));

    await expect(createClientAction(agencyId, input)).resolves.toEqual({ error: "Unable to create client" });
  });
});

describe("updateClientAction", () => {
  it("returns the updated client on success", async () => {
    mockedUpdate.mockResolvedValueOnce(client);

    await expect(updateClientAction(agencyId, client.id, input)).resolves.toEqual({ client });
    expect(mockedUpdate).toHaveBeenCalledWith(agencyId, client.id, input);
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdate.mockRejectedValueOnce(new AuthApiError("Client not found", 404));

    await expect(updateClientAction(agencyId, client.id, input)).resolves.toEqual({ error: "Client not found" });
  });
});

describe("setClientActiveAction", () => {
  it("archives the client and returns the updated record", async () => {
    const archived = { ...client, is_active: false };
    mockedSetActive.mockResolvedValueOnce(archived);

    await expect(setClientActiveAction(agencyId, client.id, false)).resolves.toEqual({ client: archived });
    expect(mockedSetActive).toHaveBeenCalledWith(agencyId, client.id, false);
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedSetActive.mockRejectedValueOnce(new Error("network down"));

    await expect(setClientActiveAction(agencyId, client.id, true)).resolves.toEqual({
      error: "Unable to update client status",
    });
  });
});

describe("deleteClientAction", () => {
  it("deletes the client and redirects to /clients on success", async () => {
    mockedDelete.mockResolvedValueOnce(undefined);

    await expect(deleteClientAction(agencyId, client.id)).rejects.toThrow("REDIRECT:/clients");

    expect(mockedDelete).toHaveBeenCalledWith(agencyId, client.id);
    expect(mockedRedirect).toHaveBeenCalledWith("/clients");
  });

  it("returns the upstream error message without redirecting", async () => {
    mockedDelete.mockRejectedValueOnce(new AuthApiError("Insufficient permissions for this agency", 403));

    await expect(deleteClientAction(agencyId, client.id)).resolves.toEqual({
      error: "Insufficient permissions for this agency",
    });
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedDelete.mockRejectedValueOnce(new Error("network down"));

    await expect(deleteClientAction(agencyId, client.id)).resolves.toEqual({ error: "Unable to delete client" });
  });
});

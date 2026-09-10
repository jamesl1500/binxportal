import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/clients.ts talks to binx-api exclusively through this shared axios
// instance. Mocking the whole module means `api.get`/`api.post`/`api.patch`/
// `api.delete` become `vi.fn()`s we control per-test, so no real HTTP
// request ever leaves the test process.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// lib/clients.ts only needs `getAccessToken` from lib/auth — everything else
// (AuthApiError, extractDetailMessage) is real so the error-shaping logic
// under test still runs for real, not against a mock.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import {
  createAgencyClient,
  deleteAgencyClient,
  getAgencyClient,
  getAgencyClients,
  setAgencyClientActive,
  updateAgencyClient,
} from "@/lib/clients";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

/** Shapes a fake error the same way axios does for a non-2xx response. */
function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";
const client = {
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

const input = {
  name: "Acme Co",
  primaryContactName: "Jamie Rivera",
  primaryContactEmail: "jamie@acme.example",
  primaryContactPhone: "555-0100",
  website: "https://acme.example",
  notes: "Prefers email over calls.",
  billingEmail: null,
  billingAddress: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("test-access-token");
});

describe("getAgencyClients", () => {
  it("fetches the agency's clients with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [client] });

    const result = await getAgencyClients(agencyId);

    expect(result).toEqual([client]);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${agencyId}/clients`, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(getAgencyClients(agencyId)).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});

describe("getAgencyClient", () => {
  it("fetches a single client with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: client });

    const result = await getAgencyClient(agencyId, client.id);

    expect(result).toEqual(client);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${agencyId}/clients/${client.id}`, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("surfaces a 404 as an AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(404, "Client not found"));

    await expect(getAgencyClient(agencyId, "missing")).rejects.toEqual(new AuthApiError("Client not found", 404));
  });
});

describe("createAgencyClient", () => {
  it("sends the snake_case payload with a bearer token", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: client });

    const result = await createAgencyClient(agencyId, input);

    expect(result).toEqual(client);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${agencyId}/clients`,
      {
        name: "Acme Co",
        primary_contact_name: "Jamie Rivera",
        primary_contact_email: "jamie@acme.example",
        primary_contact_phone: "555-0100",
        website: "https://acme.example",
        notes: "Prefers email over calls.",
        billing_email: null,
        billing_address: null,
      },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(422, "Client name is required"));

    await expect(createAgencyClient(agencyId, { ...input, name: "" })).rejects.toEqual(
      new AuthApiError("Client name is required", 422),
    );
  });
});

describe("updateAgencyClient", () => {
  it("sends a full replace with a bearer token", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: client });

    const result = await updateAgencyClient(agencyId, client.id, input);

    expect(result).toEqual(client);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${agencyId}/clients/${client.id}`,
      expect.objectContaining({ name: "Acme Co" }),
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });
});

describe("setAgencyClientActive", () => {
  it("archives a client via the status endpoint", async () => {
    const archived = { ...client, is_active: false };
    mockedApi.patch.mockResolvedValueOnce({ data: archived });

    const result = await setAgencyClientActive(agencyId, client.id, false);

    expect(result).toEqual(archived);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${agencyId}/clients/${client.id}/status`,
      { is_active: false },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });
});

describe("deleteAgencyClient", () => {
  it("sends the delete request with a bearer token", async () => {
    mockedApi.delete.mockResolvedValueOnce({});

    await deleteAgencyClient(agencyId, client.id);

    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${agencyId}/clients/${client.id}`, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("surfaces a permission error as an AuthApiError", async () => {
    mockedApi.delete.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));

    await expect(deleteAgencyClient(agencyId, client.id)).rejects.toEqual(
      new AuthApiError("Insufficient permissions for this agency", 403),
    );
  });
});

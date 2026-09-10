import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  getClientContactInvitations,
  getClientContacts,
  inviteClientContact,
  removeClientContact,
  resendClientContactInvitation,
  revokeClientContactInvitation,
} from "@/lib/clients";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "ag-1";
const C = "cl-1";
const AUTH = { headers: { Authorization: "Bearer tok" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`s${status}`), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

describe("client portal contacts", () => {
  it("getClientContacts lists a client's contacts", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [{ id: "ct1" }] });
    expect(await getClientContacts(A, C)).toEqual([{ id: "ct1" }]);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/clients/${C}/contacts`, AUTH);
  });

  it("getClientContactInvitations passes status=all only when includeAll", async () => {
    mockedApi.get.mockResolvedValue({ data: [] });
    await getClientContactInvitations(A, C);
    expect(mockedApi.get).toHaveBeenLastCalledWith(`/agencies/${A}/clients/${C}/contacts/invitations`, {
      ...AUTH,
      params: undefined,
    });
    await getClientContactInvitations(A, C, { includeAll: true });
    expect(mockedApi.get).toHaveBeenLastCalledWith(`/agencies/${A}/clients/${C}/contacts/invitations`, {
      ...AUTH,
      params: { status: "all" },
    });
  });

  it("inviteClientContact POSTs email + nulled title", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "inv1" } });
    await inviteClientContact(A, C, { email: "p@client.test" });
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/clients/${C}/contacts/invitations`,
      { email: "p@client.test", title: null },
      AUTH,
    );
  });

  it("resendClientContactInvitation POSTs to the resend sub-resource", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "inv1" } });
    await resendClientContactInvitation(A, C, "inv1");
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/clients/${C}/contacts/invitations/inv1/resend`,
      undefined,
      AUTH,
    );
  });

  it("revokeClientContactInvitation DELETEs the invitation", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await revokeClientContactInvitation(A, C, "inv1");
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/clients/${C}/contacts/invitations/inv1`, AUTH);
  });

  it("removeClientContact DELETEs the contact", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await removeClientContact(A, C, "ct1");
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/clients/${C}/contacts/ct1`, AUTH);
  });

  it("maps upstream errors to AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(409, "Already invited"));
    await expect(inviteClientContact(A, C, { email: "x@y.z" })).rejects.toMatchObject({
      name: "AuthApiError",
      status: 409,
      message: "Already invited",
    });
  });

  it.each([
    ["getClientContacts", () => getClientContacts(A, C)],
    ["getClientContactInvitations", () => getClientContactInvitations(A, C)],
    ["inviteClientContact", () => inviteClientContact(A, C, { email: "x@y.z" })],
    ["resendClientContactInvitation", () => resendClientContactInvitation(A, C, "i1")],
    ["revokeClientContactInvitation", () => revokeClientContactInvitation(A, C, "i1")],
    ["removeClientContact", () => removeClientContact(A, C, "ct1")],
  ])("%s throws AuthApiError(401) when unauthenticated", async (_n, call) => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });
});

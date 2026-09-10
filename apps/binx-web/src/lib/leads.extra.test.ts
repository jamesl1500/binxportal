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
import * as leads from "@/lib/leads";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "ag-1";
const L = "lead-1";
const AUTH = { headers: { Authorization: "Bearer tok" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`s${status}`), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

describe("leads.ts pipeline + AI helpers", () => {
  it("getLeads forwards the filter as query params", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await leads.getLeads(A, { status: "new", ownerId: "u1", source: "manual" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/leads`, {
      ...AUTH,
      params: { status: "new", owner_id: "u1", source: "manual" },
    });
  });

  it("createLead maps camelCase to the API payload with defaults", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: L } });
    await leads.createLead(A, { name: "Acme" } as never);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/leads`,
      expect.objectContaining({ name: "Acme", source: "manual", contact_email: null }),
      AUTH,
    );
  });

  it("updateLead PATCHes the mapped payload", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: L } });
    await leads.updateLead(A, L, { name: "Acme 2" } as never);
    expect(mockedApi.patch.mock.calls[0][0]).toBe(`/agencies/${A}/leads/${L}`);
  });

  it("deleteLead DELETEs the lead", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await leads.deleteLead(A, L);
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/leads/${L}`, AUTH);
  });

  it("changeLeadStatus sends status + nulled lost_reason", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: L } });
    await leads.changeLeadStatus(A, L, "lost" as never, "budget");
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/leads/${L}/status`,
      { status: "lost", lost_reason: "budget" },
      AUTH,
    );
  });

  it("assignLeadOwner sends owner_id (or null to unassign)", async () => {
    mockedApi.patch.mockResolvedValue({ data: { id: L } });
    await leads.assignLeadOwner(A, L, null);
    expect(mockedApi.patch).toHaveBeenLastCalledWith(`/agencies/${A}/leads/${L}/owner`, { owner_id: null }, AUTH);
  });

  it("getLeadEvents / addLeadNote hit the events sub-resource", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await leads.getLeadEvents(A, L);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/leads/${L}/events`, AUTH);

    mockedApi.post.mockResolvedValueOnce({ data: { id: "ev1" } });
    await leads.addLeadNote(A, L, "called them");
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/leads/${L}/events`, { body: "called them" }, AUTH);
  });

  it("convertLead / analyzeLead / analyzeOpenLeads POST to their endpoints", async () => {
    mockedApi.post.mockResolvedValue({ data: {} });
    await leads.convertLead(A, L);
    expect(mockedApi.post).toHaveBeenLastCalledWith(`/agencies/${A}/leads/${L}/convert`, undefined, AUTH);
    await leads.analyzeLead(A, L);
    expect(mockedApi.post).toHaveBeenLastCalledWith(`/agencies/${A}/leads/${L}/analyze`, undefined, AUTH);
    await leads.analyzeOpenLeads(A);
    expect(mockedApi.post).toHaveBeenLastCalledWith(`/agencies/${A}/leads/analyze`, undefined, AUTH);
  });

  it("generateLeads returns the candidate array and defaults count to 5", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { candidates: [{ name: "Co" }] } });
    const res = await leads.generateLeads(A, { industry: "design" } as never);
    expect(res).toEqual([{ name: "Co" }]);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/leads/generate`,
      expect.objectContaining({ industry: "design", count: 5, location: null }),
      AUTH,
    );
  });

  it("importLeads POSTs the reviewed candidates", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { imported: 2, skipped: 0 } });
    await leads.importLeads(A, [{ name: "Co" }] as never);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/leads/import`, { candidates: [{ name: "Co" }] }, AUTH);
  });

  it("wraps upstream errors as AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(402, "AI budget exhausted"));
    await expect(leads.getLeads(A)).rejects.toMatchObject({ name: "AuthApiError", status: 402 });
  });

  it.each([
    ["getLead", () => leads.getLead(A, L)],
    ["createLead", () => leads.createLead(A, { name: "x" } as never)],
    ["convertLead", () => leads.convertLead(A, L)],
    ["generateLeads", () => leads.generateLeads(A, {} as never)],
    ["importLeads", () => leads.importLeads(A, [])],
  ])("%s throws AuthApiError(401) when unauthenticated", async (_n, call) => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });
});

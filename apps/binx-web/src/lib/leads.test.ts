import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import { analyzeOpenLeads, convertLead, createLead, generateLeads, getLeads, importLeads } from "@/lib/leads";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

function axiosError(status: number, detail: string) {
  return Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
});

describe("getLeads", () => {
  it("passes the filter params with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await getLeads("a1", { status: "qualified", ownerId: "u1", source: "referral" });
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/leads", {
      headers: { Authorization: "Bearer token" },
      params: { status: "qualified", owner_id: "u1", source: "referral" },
    });
  });

  it("throws AuthApiError(401) with no session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(getLeads("a1")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });
});

describe("createLead", () => {
  it("maps camelCase input to the snake_case body", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "l1" } });
    await createLead("a1", { name: "Acme", contactEmail: "x@acme.example", estimatedValueCents: 500000, source: "inbound" });
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/leads",
      expect.objectContaining({
        name: "Acme",
        contact_email: "x@acme.example",
        estimated_value_cents: 500000,
        source: "inbound",
      }),
      { headers: { Authorization: "Bearer token" } },
    );
  });
});

describe("convertLead", () => {
  it("surfaces a 409 as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(409, "This lead has already been converted"));
    await expect(convertLead("a1", "l1")).rejects.toEqual(
      new AuthApiError("This lead has already been converted", 409),
    );
  });
});

describe("analyzeOpenLeads", () => {
  it("POSTs to the bulk analyze endpoint and returns the result", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { analyzed: 3, skipped: 1, leads: [] } });
    const result = await analyzeOpenLeads("a1");
    expect(mockedApi.post).toHaveBeenCalledWith("/agencies/a1/leads/analyze", undefined, {
      headers: { Authorization: "Bearer token" },
    });
    expect(result.analyzed).toBe(3);
  });
});

describe("generateLeads", () => {
  it("maps the brief to the snake_case body and returns candidates", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { candidates: [{ name: "Contoso" }] } });
    const candidates = await generateLeads("a1", { industry: "retail", companySize: "10-50", count: 4 });
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/leads/generate",
      { industry: "retail", location: null, company_size: "10-50", keywords: null, count: 4 },
      { headers: { Authorization: "Bearer token" } },
    );
    expect(candidates).toEqual([{ name: "Contoso" }]);
  });
});

describe("importLeads", () => {
  it("surfaces a 402 (plan cap) as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(402, "Your Free plan is limited to 25 leads."));
    await expect(importLeads("a1", [{ name: "X", website: null, contact_email: null, contact_phone: null, estimated_value_cents: null, rationale: null }])).rejects.toEqual(
      new AuthApiError("Your Free plan is limited to 25 leads.", 402),
    );
  });
});

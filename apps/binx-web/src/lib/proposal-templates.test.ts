import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});
vi.mock("@/lib/proposal-access", () => ({ proposalAccessHeaders: vi.fn(), codeRequiredFrom: () => null }));

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import * as templates from "@/lib/proposal-templates";

const mockedApi = vi.mocked(api, true);
const AUTH = { headers: { Authorization: "Bearer tok" } };

const terms = {
  leadId: "lead-1",
  clientId: "client-1",
  title: "Website",
  recipientName: "Jane",
  recipientEmail: "jane@example.com",
  content: null,
  currency: "USD",
  taxRatePercent: "0",
  validUntil: "2030-01-01",
  templateId: "t0",
  lineItems: [{ description: "Site", quantity: "1", unitPriceCents: 100 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAccessToken).mockResolvedValue("tok");
});

describe("proposal-templates", () => {
  it("never sends who a proposal is for as part of a template", () => {
    const payload = templates.toTemplatePayload({ name: "Website", description: null, terms, validForDays: 30 });
    expect(payload.name).toBe("Website");
    expect(payload.data).toMatchObject({ title: "Website", valid_for_days: 30 });
    for (const key of ["lead_id", "client_id", "recipient_name", "recipient_email", "valid_until", "template_id"]) {
      expect(payload.data).not.toHaveProperty(key);
    }
    expect(payload.data).toHaveProperty("line_items");
  });

  it("creates, updates, lists and deletes templates", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "t1" } });
    await templates.createProposalTemplate("a1", { name: "W", description: "d", terms, validForDays: null });
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/proposal-templates",
      expect.objectContaining({ name: "W", description: "d" }),
      AUTH,
    );

    mockedApi.put.mockResolvedValueOnce({ data: { id: "t1" } });
    await templates.updateProposalTemplate("a1", "t1", { name: "W2", description: null, terms, validForDays: 7 });
    expect(mockedApi.put).toHaveBeenCalledWith(
      "/agencies/a1/proposal-templates/t1",
      expect.objectContaining({ name: "W2", data: expect.objectContaining({ valid_for_days: 7 }) }),
      AUTH,
    );

    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await expect(templates.getProposalTemplates("a1")).resolves.toEqual([]);
    mockedApi.delete.mockResolvedValueOnce({});
    await templates.deleteProposalTemplate("a1", "t1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/agencies/a1/proposal-templates/t1", AUTH);
  });

  it("saves a proposal as a template", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "t2" } });
    await templates.saveProposalAsTemplate("a1", "p1", "From Fjord", null);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/proposals/p1/save-as-template",
      { name: "From Fjord", description: null },
      AUTH,
    );
  });

  it("maps errors to AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(
      Object.assign(new Error("x"), { isAxiosError: true, response: { status: 409, data: { detail: "Too many" } } }),
    );
    await expect(
      templates.createProposalTemplate("a1", { name: "W", description: null, terms, validForDays: null }),
    ).rejects.toMatchObject({ name: "AuthApiError", status: 409, message: "Too many" });
  });
});

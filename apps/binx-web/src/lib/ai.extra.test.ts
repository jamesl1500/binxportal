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
import * as ai from "@/lib/ai";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "ag-1";
const AUTH = { headers: { Authorization: "Bearer tok" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`s${status}`), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

describe("ai.ts", () => {
  it("getAiSettings GETs the settings", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { is_enabled: true } });
    expect(await ai.getAiSettings(A)).toEqual({ is_enabled: true });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/ai/settings`, AUTH);
  });

  it("updateAiSettings maps camelCase to snake_case", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: {} });
    await ai.updateAiSettings(A, { isEnabled: false, monthlyBudgetCents: 5000, dailyUserRequestCap: 20 });
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/ai/settings`,
      { is_enabled: false, monthly_budget_cents: 5000, daily_user_request_cap: 20 },
      AUTH,
    );
  });

  it("getAiUsage GETs the usage summary", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { spent_cents: 100 } });
    expect(await ai.getAiUsage(A)).toEqual({ spent_cents: 100 });
  });

  it("getAiBriefing unwraps the briefing text", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { briefing: "Focus on overdue invoices." } });
    expect(await ai.getAiBriefing(A)).toBe("Focus on overdue invoices.");
  });

  it("generateProjectSummary unwraps the draft", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { draft: "The project is on track." } });
    expect(await ai.generateProjectSummary(A, "p1")).toBe("The project is on track.");
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/projects/p1/ai/summary`, undefined, AUTH);
  });

  it("generateInvoiceReminder unwraps the draft", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { draft: "Friendly reminder…" } });
    expect(await ai.generateInvoiceReminder(A, "i1")).toBe("Friendly reminder…");
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/invoices/i1/ai/reminder`, undefined, AUTH);
  });

  it("listAiConversations / createAiConversation hit the conversations resource", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await ai.listAiConversations(A);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/ai/conversations`, AUTH);

    mockedApi.post.mockResolvedValueOnce({ data: { id: "conv1" } });
    await ai.createAiConversation(A);
    expect(mockedApi.post).toHaveBeenCalledWith(`/agencies/${A}/ai/conversations`, undefined, AUTH);
  });

  it("getAiConversationMessages / sendAiMessage / deleteAiConversation", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await ai.getAiConversationMessages(A, "conv1");
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/ai/conversations/conv1/messages`, AUTH);

    mockedApi.post.mockResolvedValueOnce({ data: { id: "m1", role: "assistant", content: "hi" } });
    await ai.sendAiMessage(A, "conv1", "hello");
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/ai/conversations/conv1/messages`,
      { message: "hello" },
      AUTH,
    );

    mockedApi.delete.mockResolvedValueOnce({});
    await ai.deleteAiConversation(A, "conv1");
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/ai/conversations/conv1`, AUTH);
  });

  it("maps a 402 (budget exhausted) to AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(402, "Monthly AI budget reached"));
    await expect(ai.generateProjectSummary(A, "p1")).rejects.toMatchObject({
      name: "AuthApiError",
      status: 402,
      message: "Monthly AI budget reached",
    });
  });

  it.each([
    ["getAiSettings", () => ai.getAiSettings(A)],
    ["updateAiSettings", () => ai.updateAiSettings(A, { isEnabled: true, monthlyBudgetCents: 0, dailyUserRequestCap: 0 })],
    ["getAiUsage", () => ai.getAiUsage(A)],
    ["getAiBriefing", () => ai.getAiBriefing(A)],
    ["generateProjectSummary", () => ai.generateProjectSummary(A, "p1")],
    ["generateInvoiceReminder", () => ai.generateInvoiceReminder(A, "i1")],
    ["listAiConversations", () => ai.listAiConversations(A)],
    ["createAiConversation", () => ai.createAiConversation(A)],
    ["getAiConversationMessages", () => ai.getAiConversationMessages(A, "c1")],
    ["sendAiMessage", () => ai.sendAiMessage(A, "c1", "x")],
    ["deleteAiConversation", () => ai.deleteAiConversation(A, "c1")],
  ])("%s throws AuthApiError(401) when unauthenticated", async (_n, call) => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });
});

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
import {
  generateInvoiceReminder,
  generateProjectSummary,
  getAiBriefing,
  getAiSettings,
  getAiUsage,
  sendAiMessage,
  updateAiSettings,
} from "@/lib/ai";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

function axiosError(status: number, detail: string) {
  return Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
});

describe("getAiSettings", () => {
  it("throws AuthApiError(401) with no session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(getAiSettings("a1")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });

  it("attaches the bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { is_enabled: true, monthly_budget_cents: 2000, daily_user_request_cap: 50, configured: true } });
    await getAiSettings("a1");
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/ai/settings", { headers: { Authorization: "Bearer token" } });
  });
});

describe("updateAiSettings", () => {
  it("maps camelCase input to the snake_case body", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: {} });
    await updateAiSettings("a1", { isEnabled: false, monthlyBudgetCents: 5000, dailyUserRequestCap: 10 });
    expect(mockedApi.patch).toHaveBeenCalledWith(
      "/agencies/a1/ai/settings",
      { is_enabled: false, monthly_budget_cents: 5000, daily_user_request_cap: 10 },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("surfaces a 403 as an AuthApiError", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));
    await expect(
      updateAiSettings("a1", { isEnabled: true, monthlyBudgetCents: 2000, dailyUserRequestCap: 50 }),
    ).rejects.toEqual(new AuthApiError("Insufficient permissions for this agency", 403));
  });
});

describe("getAiUsage", () => {
  it("returns the usage summary", async () => {
    const summary = {
      configured: true,
      is_enabled: true,
      monthly_budget_cents: 2000,
      month_spent_cents: 100,
      daily_user_request_cap: 50,
      today_request_count: 1,
      recent_events: [],
    };
    mockedApi.get.mockResolvedValueOnce({ data: summary });
    await expect(getAiUsage("a1")).resolves.toEqual(summary);
  });
});

describe("getAiBriefing", () => {
  it("unwraps the briefing field", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { briefing: "You have 2 overdue invoices." } });
    await expect(getAiBriefing("a1")).resolves.toBe("You have 2 overdue invoices.");
  });

  it("surfaces a 503 as an AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(503, "AI isn't configured for this agency yet."));
    await expect(getAiBriefing("a1")).rejects.toMatchObject({ status: 503 });
  });

  it("surfaces a 429 (budget/cap exceeded) as an AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(429, "This agency's $20.00 monthly AI budget is used up."));
    await expect(getAiBriefing("a1")).rejects.toMatchObject({ status: 429 });
  });
});

describe("generateProjectSummary / generateInvoiceReminder", () => {
  it("unwraps the draft field for a project summary", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { draft: "Great progress this week." } });
    await expect(generateProjectSummary("a1", "p1")).resolves.toBe("Great progress this week.");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/projects/p1/ai/summary",
      undefined,
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("unwraps the draft field for an invoice reminder", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { draft: "Just a friendly reminder…" } });
    await expect(generateInvoiceReminder("a1", "i1")).resolves.toBe("Just a friendly reminder…");
  });

  it("surfaces a 400 (invoice not sent) as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(400, "Only a sent invoice can get a reminder drafted."));
    await expect(generateInvoiceReminder("a1", "i1")).rejects.toMatchObject({ status: 400 });
  });
});

describe("sendAiMessage", () => {
  it("posts the message and returns the assistant's reply", async () => {
    const message = { id: "m1", role: "assistant", content: "You have no overdue invoices.", created_at: "2026-01-01T00:00:00Z" };
    mockedApi.post.mockResolvedValueOnce({ data: message });
    await expect(sendAiMessage("a1", "c1", "Any overdue invoices?")).resolves.toEqual(message);
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/ai/conversations/c1/messages",
      { message: "Any overdue invoices?" },
      { headers: { Authorization: "Bearer token" } },
    );
  });
});

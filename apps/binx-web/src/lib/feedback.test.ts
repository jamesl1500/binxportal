import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  answerPulse,
  dismissPulse,
  getDuePulse,
  getFeedbackInbox,
  submitFeedback,
  updateFeedback,
} from "@/lib/feedback";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);
const AUTH = { headers: { Authorization: "Bearer token" } };
const CONTEXT = { pagePath: "/projects", userAgent: "UA", viewport: "800x600" };

function axiosError(status: number, detail: string) {
  return Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
});

describe("submitFeedback", () => {
  it("maps the input to the API body", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "f1" } });
    await submitFeedback({
      surface: "app",
      agencyId: "a1",
      kind: "bug",
      rating: 2,
      message: "Broken",
      allowContact: false,
      ...CONTEXT,
    });
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/feedback",
      {
        surface: "app",
        agency_id: "a1",
        kind: "bug",
        rating: 2,
        message: "Broken",
        allow_contact: false,
        page_path: "/projects",
        user_agent: "UA",
        viewport: "800x600",
      },
      AUTH,
    );
  });

  it("never sends an agency id from the portal (the API derives it)", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "f1" } });
    await submitFeedback({
      surface: "portal",
      agencyId: "a1",
      kind: "idea",
      message: "Hi",
      allowContact: true,
      ...CONTEXT,
    });
    expect(mockedApi.post.mock.calls[0][1]).toMatchObject({ agency_id: null, rating: null });
  });

  it("surfaces the API's message (e.g. the hourly limit)", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(429, "That's a lot of feedback"));
    await expect(
      submitFeedback({ surface: "app", kind: "bug", message: "x", allowContact: true, ...CONTEXT }),
    ).rejects.toMatchObject({ name: "AuthApiError", status: 429, message: "That's a lot of feedback" });
  });

  it("requires a session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(
      submitFeedback({ surface: "app", kind: "bug", message: "x", allowContact: true, ...CONTEXT }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("pulse", () => {
  it("reads the due milestone", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { pulse_key: "first-week" } });
    await expect(getDuePulse()).resolves.toBe("first-week");
    expect(mockedApi.get).toHaveBeenCalledWith("/feedback/pulse", AUTH);
  });

  it("answers and dismisses by key", async () => {
    mockedApi.post.mockResolvedValue({ data: {} });
    await answerPulse("first-week", { surface: "app", agencyId: "a1", rating: 4, ...CONTEXT });
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/feedback/pulse/first-week",
      expect.objectContaining({ rating: 4, message: "", agency_id: "a1" }),
      AUTH,
    );
    await dismissPulse("first-week");
    expect(mockedApi.post).toHaveBeenLastCalledWith("/feedback/pulse/first-week/dismiss", null, AUTH);
  });
});

describe("admin", () => {
  it("only sends the filters that are set", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    await getFeedbackInbox({ status: "open", q: "  ", limit: 25 });
    expect(mockedApi.get).toHaveBeenCalledWith("/admin/feedback", {
      ...AUTH,
      params: { status: "open", limit: 25 },
    });
  });

  it("patches only the changed fields", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: "f1" } });
    await updateFeedback("f1", { internalNote: "" });
    expect(mockedApi.patch).toHaveBeenCalledWith("/admin/feedback/f1", { internal_note: "" }, AUTH);
  });
});

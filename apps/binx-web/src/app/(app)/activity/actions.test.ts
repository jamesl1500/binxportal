import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/activity", () => ({
  getAgencyActivity: vi.fn(),
  getMyActivity: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import { getAgencyActivity, getMyActivity } from "@/lib/activity";
import { getAgencyActivityAction, getMyActivityAction } from "./actions";

const mockedAgency = vi.mocked(getAgencyActivity);
const mockedMine = vi.mocked(getMyActivity);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAgencyActivityAction", () => {
  it("returns the page on success", async () => {
    const page = { items: [], has_more: false };
    mockedAgency.mockResolvedValueOnce(page);
    await expect(getAgencyActivityAction("a-1", { category: "team" })).resolves.toEqual({ page });
    expect(mockedAgency).toHaveBeenCalledWith("a-1", { category: "team" });
  });

  it("maps an AuthApiError to { error }", async () => {
    mockedAgency.mockRejectedValueOnce(new AuthApiError("nope", 403));
    await expect(getAgencyActivityAction("a-1")).resolves.toEqual({ error: "nope" });
  });

  it("falls back to a generic message", async () => {
    mockedAgency.mockRejectedValueOnce(new Error("network"));
    await expect(getAgencyActivityAction("a-1")).resolves.toEqual({ error: "Unable to load activity" });
  });
});

describe("getMyActivityAction", () => {
  it("returns the page on success", async () => {
    const page = { items: [], has_more: false };
    mockedMine.mockResolvedValueOnce(page);
    await expect(getMyActivityAction({ limit: 15 })).resolves.toEqual({ page });
  });

  it("maps an AuthApiError to { error }", async () => {
    mockedMine.mockRejectedValueOnce(new AuthApiError("Not authenticated", 401));
    await expect(getMyActivityAction()).resolves.toEqual({ error: "Not authenticated" });
  });
});

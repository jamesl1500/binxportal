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
import { changePlan, getPlanCatalog, getSubscription } from "@/lib/billing";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

function axiosError(status: number, detail: string) {
  return Object.assign(new Error("x"), { isAxiosError: true, response: { status, data: { detail } } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
});

describe("getSubscription", () => {
  it("GETs the plan endpoint with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { plan: "free" } });
    await getSubscription("a1");
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/plan", {
      headers: { Authorization: "Bearer token" },
    });
  });
});

describe("getPlanCatalog", () => {
  it("GETs the catalog endpoint", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await getPlanCatalog("a1");
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/plan/catalog", {
      headers: { Authorization: "Bearer token" },
    });
  });
});

describe("changePlan", () => {
  it("POSTs the chosen plan key", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { plan: "pro" } });
    const result = await changePlan("a1", "pro");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/plan",
      { plan: "pro" },
      { headers: { Authorization: "Bearer token" } },
    );
    expect(result.plan).toBe("pro");
  });

  it("surfaces a 403 (non-owner) as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));
    await expect(changePlan("a1", "pro")).rejects.toEqual(
      new AuthApiError("Insufficient permissions for this agency", 403),
    );
  });
});

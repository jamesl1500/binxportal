import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import { getAgencyActivity, getMyActivity } from "@/lib/activity";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`status ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

const page = { items: [{ id: "e-1", category: "team", event_type: "member_joined", summary: "X joined" }], has_more: false };

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

describe("getAgencyActivity", () => {
  it("passes category + pagination params with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: page });

    await expect(getAgencyActivity("a-1", { category: "clients", limit: 30, offset: 30 })).resolves.toEqual(page);
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a-1/activity", {
      headers: { Authorization: "Bearer tok" },
      params: { category: "clients", limit: 30, offset: 30 },
    });
  });

  it("throws AuthApiError(401) with no token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(getAgencyActivity("a-1")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });

  it("surfaces binx-api's error detail", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(403, "Insufficient permissions for this agency"));
    await expect(getAgencyActivity("a-1")).rejects.toEqual(
      new AuthApiError("Insufficient permissions for this agency", 403),
    );
  });
});

describe("getMyActivity", () => {
  it("hits /activity/me", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: page });
    await getMyActivity({ limit: 15 });
    expect(mockedApi.get).toHaveBeenCalledWith("/activity/me", {
      headers: { Authorization: "Bearer tok" },
      params: { limit: 15, offset: undefined },
    });
  });
});

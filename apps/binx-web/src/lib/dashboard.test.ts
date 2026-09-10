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
import { getMyWork } from "@/lib/dashboard";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const payload = {
  tasks: [
    {
      id: "t1",
      title: "Ship it",
      due_date: "2026-09-10",
      project_id: "p1",
      project_name: "Alpha",
      client_name: "Acme",
      list_name: "In Progress",
      overdue: false,
    },
  ],
  total_open: 1,
  overdue_count: 0,
  due_soon_count: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
});

describe("getMyWork", () => {
  it("fetches the rollup with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: payload });

    await expect(getMyWork("a1")).resolves.toEqual(payload);
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/my-work", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("throws AuthApiError(401) when there is no session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(getMyWork("a1")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("surfaces an API error as an AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { isAxiosError: true, response: { status: 500, data: { detail: "x" } } }),
    );
    await expect(getMyWork("a1")).rejects.toBeInstanceOf(AuthApiError);
  });
});

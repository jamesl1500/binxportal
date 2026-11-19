import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  addAdminNote,
  getAdminAgencies,
  getPlatformOverview,
  grantTrial,
  runUserAction,
  weekLabel,
} from "@/lib/admin";

const mockedGet = vi.mocked(api.get);
const mockedPost = vi.mocked(api.post);
const mockedPut = vi.mocked(api.put);
const AUTH = { headers: { Authorization: "Bearer token" } };
const mockedToken = vi.mocked(getAccessToken);

beforeEach(() => {
  vi.clearAllMocks();
  mockedToken.mockResolvedValue("token");
});

describe("getPlatformOverview", () => {
  it("calls the admin endpoint with the session token", async () => {
    mockedGet.mockResolvedValueOnce({ data: { agencies_total: 1 } });
    await expect(getPlatformOverview()).resolves.toEqual({ agencies_total: 1 });
    expect(mockedGet).toHaveBeenCalledWith("/admin/overview", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("maps a 403 to AuthApiError", async () => {
    mockedGet.mockRejectedValueOnce(
      Object.assign(new Error("x"), {
        isAxiosError: true,
        response: { status: 403, data: { detail: "Insufficient permissions" } },
      }),
    );
    await expect(getPlatformOverview()).rejects.toMatchObject({
      name: "AuthApiError",
      status: 403,
      message: "Insufficient permissions",
    });
  });

  it("requires a session", async () => {
    mockedToken.mockResolvedValueOnce(undefined);
    await expect(getPlatformOverview()).rejects.toMatchObject({ status: 401 });
  });
});

describe("weekLabel", () => {
  it("formats the week start in UTC so it never slips a day", () => {
    expect(weekLabel("2026-11-16")).toBe("Nov 16");
    expect(weekLabel("2026-01-05")).toBe("Jan 5");
  });
});

describe("support tooling", () => {
  it("sends only the agency filters that are set", async () => {
    mockedGet.mockResolvedValueOnce({ data: { items: [], total: 0 } });
    await getAdminAgencies({ q: "  pixel ", trialing: false });
    expect(mockedGet).toHaveBeenCalledWith("/admin/agencies", {
      ...AUTH,
      params: { limit: 25, q: "pixel", trialing: false },
    });
  });

  it("routes each account action to its endpoint", async () => {
    mockedPost.mockResolvedValue({ data: { message: "ok" } });
    mockedPut.mockResolvedValue({ data: { message: "ok" } });

    await runUserAction("u1", "password-reset");
    expect(mockedPost).toHaveBeenLastCalledWith("/admin/users/u1/password-reset", null, AUTH);

    await runUserAction("u1", "deactivate", "Left the agency");
    expect(mockedPost).toHaveBeenLastCalledWith(
      "/admin/users/u1/deactivate",
      { reason: "Left the agency" },
      AUTH,
    );

    await runUserAction("u1", "make-admin");
    expect(mockedPut).toHaveBeenLastCalledWith("/admin/users/u1/role", { role: "admin" }, AUTH);
    await runUserAction("u1", "remove-admin");
    expect(mockedPut).toHaveBeenLastCalledWith("/admin/users/u1/role", { role: "user" }, AUTH);
  });

  it("posts trials and notes", async () => {
    mockedPost.mockResolvedValue({ data: {} });
    await grantTrial("a1", { plan: "pro", days: 14 });
    expect(mockedPost).toHaveBeenLastCalledWith(
      "/admin/agencies/a1/trial",
      { plan: "pro", days: 14, reason: null },
      AUTH,
    );
    await addAdminNote("agency", "a1", "Called them");
    expect(mockedPost).toHaveBeenLastCalledWith("/admin/agencies/a1/notes", { body: "Called them" }, AUTH);
  });
});

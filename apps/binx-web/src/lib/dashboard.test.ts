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
import { getDashboard, getMyWork } from "@/lib/dashboard";

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

const overviewPayload = {
  projects_total: 4,
  projects_active: 2,
  on_hold_projects: [],
  clients_total: 3,
  clients_active: 2,
  invoice_summary: {
    outstanding_cents: 5_000,
    overdue_cents: 0,
    paid_this_year_cents: 0,
    lifetime_billed_cents: 5_000,
    average_invoice_cents: 5_000,
    draft_count: 0,
    open_count: 1,
    overdue_count: 0,
    monthly_paid: [],
  },
  overdue_invoices: [],
  unread_messages: 2,
  my_work: payload,
  recent_activity: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("token");
});

describe("getDashboard", () => {
  it("fetches the Overview rollup with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: overviewPayload });

    await expect(getDashboard("a1")).resolves.toEqual(overviewPayload);
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/dashboard", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("throws AuthApiError(401) when there is no session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);
    await expect(getDashboard("a1")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("surfaces an API error as an AuthApiError", async () => {
    mockedApi.get.mockRejectedValueOnce(
      Object.assign(new Error("boom"), { isAxiosError: true, response: { status: 403, data: { detail: "x" } } }),
    );
    await expect(getDashboard("a1")).rejects.toMatchObject({ name: "AuthApiError", status: 403 });
  });
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

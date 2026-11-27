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
import * as services from "@/lib/services";
import { lineValuesFromService } from "@/lib/services-client";

const mockedApi = vi.mocked(api, true);
const AUTH = { Authorization: "Bearer tok" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAccessToken).mockResolvedValue("tok");
});

describe("services.ts", () => {
  it("lists active services, or all of them on request", async () => {
    mockedApi.get.mockResolvedValue({ data: [] });
    await services.getServices("a1");
    expect(mockedApi.get).toHaveBeenLastCalledWith("/agencies/a1/services", { headers: AUTH, params: {} });
    await services.getServices("a1", { includeArchived: true });
    expect(mockedApi.get).toHaveBeenLastCalledWith("/agencies/a1/services", {
      headers: AUTH,
      params: { include_archived: true },
    });
  });

  it("creates with a snake_case payload", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "svc-1" } });
    await services.createService("a1", {
      name: "Retainer",
      description: null,
      pricingType: "monthly",
      unitPriceCents: 200000,
      defaultQuantity: "1",
    });
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/services",
      {
        name: "Retainer",
        description: null,
        pricing_type: "monthly",
        unit_price_cents: 200000,
        default_quantity: "1",
        is_starting_price: false,
        category_id: null,
      },
      { headers: AUTH },
    );
  });

  it("sends only the fields being changed", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: "svc-1" } });
    await services.updateService("a1", "svc-1", { isArchived: true });
    expect(mockedApi.patch).toHaveBeenCalledWith("/agencies/a1/services/svc-1", { is_archived: true }, { headers: AUTH });
  });

  it("maps errors to AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(
      Object.assign(new Error("409"), { isAxiosError: true, response: { status: 409, data: { detail: "Taken" } } }),
    );
    await expect(
      services.createService("a1", {
        name: "X",
        description: null,
        pricingType: "fixed",
        unitPriceCents: 1,
        defaultQuantity: "1",
      }),
    ).rejects.toMatchObject({ message: "Taken", status: 409 });
  });
});

describe("lineValuesFromService", () => {
  it("copies a service into editor values", () => {
    expect(
      lineValuesFromService({
        id: "svc-1",
        agency_id: "a1",
        name: "Design hours",
        description: null,
        pricing_type: "hourly",
        unit_price_cents: 15050,
        default_quantity: "2.50",
        is_archived: false,
        is_starting_price: false,
        created_at: "2026-11-01T00:00:00Z",
      }),
    ).toEqual({
      serviceId: "svc-1",
      description: "Design hours",
      details: "",
      quantity: "2.5",
      unitPrice: "150.50",
      billing: "one_time",
      startingPrice: false,
    });
  });

  it("makes a monthly service a monthly line", () => {
    expect(
      lineValuesFromService({
        id: "svc-2",
        agency_id: "a1",
        name: "Retainer",
        description: null,
        pricing_type: "monthly",
        unit_price_cents: 250000,
        default_quantity: "1.00",
        is_archived: false,
        is_starting_price: false,
        created_at: "2026-11-01T00:00:00Z",
      }).billing,
    ).toBe("monthly");
  });

  it("manages categories", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await services.getServiceCategories("a1");
    expect(mockedApi.get).toHaveBeenCalledWith("/agencies/a1/service-categories", { headers: AUTH });
    mockedApi.post.mockResolvedValueOnce({ data: { id: "c1" } });
    await services.createServiceCategory("a1", "Branding");
    expect(mockedApi.post).toHaveBeenCalledWith("/agencies/a1/service-categories", { name: "Branding" }, { headers: AUTH });
    mockedApi.patch.mockResolvedValueOnce({ data: { id: "c1" } });
    await services.updateServiceCategory("a1", "c1", { name: "Brand" });
    expect(mockedApi.patch).toHaveBeenCalledWith("/agencies/a1/service-categories/c1", { name: "Brand" }, { headers: AUTH });
    mockedApi.delete.mockResolvedValueOnce({});
    await services.deleteServiceCategory("a1", "c1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/agencies/a1/service-categories/c1", { headers: AUTH });
  });

  it("moves a service between categories, and out with null", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: "svc-1" } });
    await services.updateService("a1", "svc-1", { categoryId: null, isStartingPrice: true });
    expect(mockedApi.patch).toHaveBeenCalledWith(
      "/agencies/a1/services/svc-1",
      { category_id: null, is_starting_price: true },
      { headers: AUTH },
    );
  });

  it("uploads and removes a service's files", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: "f1" } });
    await services.uploadServiceAttachment("a1", "svc-1", new File(["x"], "a.png", { type: "image/png" }));
    expect(mockedApi.post).toHaveBeenCalledWith("/agencies/a1/services/svc-1/attachments", expect.any(FormData), {
      headers: { ...AUTH, "Content-Type": undefined },
    });
    mockedApi.delete.mockResolvedValueOnce({});
    await services.deleteServiceAttachment("a1", "svc-1", "f1");
    expect(mockedApi.delete).toHaveBeenCalledWith("/agencies/a1/services/svc-1/attachments/f1", { headers: AUTH });
  });
});

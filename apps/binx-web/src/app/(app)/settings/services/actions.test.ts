import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/services", () => ({
  createService: vi.fn(),
  updateService: vi.fn(),
  deleteService: vi.fn(),
}));

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { createService, deleteService, updateService } from "@/lib/services";

import {
  createServiceAction,
  deleteServiceAction,
  setServiceArchivedAction,
  updateServiceAction,
} from "./actions";

const input = {
  name: "Retainer",
  description: null,
  pricingType: "monthly",
  unitPriceCents: 200000,
  defaultQuantity: "1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("services actions", () => {
  it("creates and refreshes", async () => {
    const service = { id: "svc-1" } as never;
    vi.mocked(createService).mockResolvedValueOnce(service);
    await expect(createServiceAction("a1", input)).resolves.toEqual({ service });
    expect(createService).toHaveBeenCalledWith("a1", input);
    expect(refresh).toHaveBeenCalled();
  });

  it("returns binx-api's message on a known error", async () => {
    vi.mocked(createService).mockRejectedValueOnce(new AuthApiError("A service called “Retainer” already exists", 409));
    await expect(createServiceAction("a1", input)).resolves.toEqual({
      error: "A service called “Retainer” already exists",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("falls back to a generic message otherwise", async () => {
    vi.mocked(updateService).mockRejectedValueOnce(new Error("boom"));
    await expect(updateServiceAction("a1", "svc-1", input)).resolves.toEqual({ error: "Unable to update service" });
  });

  it("archives and restores through a partial update", async () => {
    vi.mocked(updateService).mockResolvedValue({ id: "svc-1" } as never);
    await setServiceArchivedAction("a1", "svc-1", true);
    expect(updateService).toHaveBeenCalledWith("a1", "svc-1", { isArchived: true });
    vi.mocked(updateService).mockRejectedValueOnce(new Error("boom"));
    await expect(setServiceArchivedAction("a1", "svc-1", false)).resolves.toEqual({
      error: "Unable to restore service",
    });
  });

  it("deletes", async () => {
    vi.mocked(deleteService).mockResolvedValueOnce(undefined);
    await expect(deleteServiceAction("a1", "svc-1")).resolves.toEqual({});
    expect(deleteService).toHaveBeenCalledWith("a1", "svc-1");
  });
});

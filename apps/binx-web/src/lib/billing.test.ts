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
  changePlan,
  createBillingPortalSession,
  createPlanCheckout,
  getPlanCatalog,
  getSubscription,
} from "@/lib/billing";

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

describe("createPlanCheckout", () => {
  it("POSTs the plan and returns the checkout URL", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { checkout_url: "https://checkout.stripe.com/abc" } });
    const url = await createPlanCheckout("a1", "pro");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/plan/checkout",
      { plan: "pro", return_to: null },
      { headers: { Authorization: "Bearer token" } },
    );
    expect(url).toBe("https://checkout.stripe.com/abc");
  });

  // Onboarding passes this so a brand-new agency lands back on /dashboard
  // after paying, instead of Settings > Plan.
  it("POSTs a returnTo override when given one", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { checkout_url: "https://checkout.stripe.com/abc" } });
    await createPlanCheckout("a1", "pro", "/dashboard");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/plan/checkout",
      { plan: "pro", return_to: "/dashboard" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("surfaces an existing-subscription 400 as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(400, "This agency already has a subscription"));
    await expect(createPlanCheckout("a1", "pro")).rejects.toEqual(
      new AuthApiError("This agency already has a subscription", 400),
    );
  });
});

describe("createBillingPortalSession", () => {
  it("POSTs a null target_plan for a plain portal link", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { portal_url: "https://billing.stripe.com/xyz" } });
    const url = await createBillingPortalSession("a1");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/plan/billing-portal",
      { target_plan: null },
      { headers: { Authorization: "Bearer token" } },
    );
    expect(url).toBe("https://billing.stripe.com/xyz");
  });

  it("POSTs the target plan when switching/canceling", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { portal_url: "https://billing.stripe.com/xyz" } });
    await createBillingPortalSession("a1", "free");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/agencies/a1/plan/billing-portal",
      { target_plan: "free" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("surfaces a 409 (no Stripe customer yet) as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(409, "This agency has no Stripe customer yet"));
    await expect(createBillingPortalSession("a1")).rejects.toEqual(
      new AuthApiError("This agency has no Stripe customer yet", 409),
    );
  });
});

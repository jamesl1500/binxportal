import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/billing", () => ({
  changePlan: vi.fn(),
  createBillingPortalSession: vi.fn(),
  createPlanCheckout: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import { changePlan, createBillingPortalSession, createPlanCheckout } from "@/lib/billing";
import { changePlanAction, openBillingPortalAction, startPlanCheckoutAction } from "./actions";

const mockedChangePlan = vi.mocked(changePlan);
const mockedCreateCheckout = vi.mocked(createPlanCheckout);
const mockedCreatePortal = vi.mocked(createBillingPortalSession);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("changePlanAction", () => {
  it("returns the updated subscription on success", async () => {
    const subscription = { plan: "pro" } as never;
    mockedChangePlan.mockResolvedValueOnce(subscription);
    await expect(changePlanAction("a1", "pro")).resolves.toEqual({ subscription });
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedChangePlan.mockRejectedValueOnce(new AuthApiError("Paid plans are managed through Checkout now.", 400));
    await expect(changePlanAction("a1", "pro")).resolves.toEqual({
      error: "Paid plans are managed through Checkout now.",
    });
  });
});

describe("startPlanCheckoutAction", () => {
  it("returns the checkout redirect URL", async () => {
    mockedCreateCheckout.mockResolvedValueOnce("https://checkout.stripe.com/abc");
    await expect(startPlanCheckoutAction("a1", "pro")).resolves.toEqual({
      redirectUrl: "https://checkout.stripe.com/abc",
    });
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedCreateCheckout.mockRejectedValueOnce(new AuthApiError("Unknown plan", 400));
    await expect(startPlanCheckoutAction("a1", "bogus")).resolves.toEqual({ error: "Unknown plan" });
  });

  it("falls back to a generic message for other errors", async () => {
    mockedCreateCheckout.mockRejectedValueOnce(new Error("boom"));
    await expect(startPlanCheckoutAction("a1", "pro")).resolves.toEqual({ error: "Unable to start checkout" });
  });
});

describe("openBillingPortalAction", () => {
  it("returns the portal redirect URL, forwarding an optional target plan", async () => {
    mockedCreatePortal.mockResolvedValueOnce("https://billing.stripe.com/xyz");
    await expect(openBillingPortalAction("a1", "free")).resolves.toEqual({
      redirectUrl: "https://billing.stripe.com/xyz",
    });
    expect(mockedCreatePortal).toHaveBeenCalledWith("a1", "free");
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedCreatePortal.mockRejectedValueOnce(new AuthApiError("This agency has no Stripe customer yet", 409));
    await expect(openBillingPortalAction("a1")).resolves.toEqual({
      error: "This agency has no Stripe customer yet",
    });
  });
});

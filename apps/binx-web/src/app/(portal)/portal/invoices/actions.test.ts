import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal", () => ({ startPortalInvoiceCheckout: vi.fn() }));

import { AuthApiError } from "@/lib/auth";
import { startPortalInvoiceCheckout } from "@/lib/portal";
import { payInvoiceAction } from "./actions";

const mockedStartCheckout = vi.mocked(startPortalInvoiceCheckout);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("payInvoiceAction", () => {
  it("returns the checkout URL on success", async () => {
    mockedStartCheckout.mockResolvedValueOnce("https://checkout.stripe.com/abc");

    await expect(payInvoiceAction("inv-1")).resolves.toEqual({ checkoutUrl: "https://checkout.stripe.com/abc" });
    expect(mockedStartCheckout).toHaveBeenCalledWith("inv-1");
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedStartCheckout.mockRejectedValueOnce(
      new AuthApiError("Online payment isn't set up for this agency yet", 409),
    );

    await expect(payInvoiceAction("inv-1")).resolves.toEqual({
      error: "Online payment isn't set up for this agency yet",
    });
  });

  it("falls back to a generic message for other errors", async () => {
    mockedStartCheckout.mockRejectedValueOnce(new Error("boom"));

    await expect(payInvoiceAction("inv-1")).resolves.toEqual({ error: "Unable to start checkout" });
  });
});

import { describe, expect, it } from "vitest";

import {
  PLATFORM_FEE_BPS,
  PLATFORM_FEE_LABEL,
  STRIPE_ESTIMATE_LABEL,
  estimateOnlinePayment,
  formatBps,
} from "./payment-fees";

describe("payment fees", () => {
  it("matches the API's 1.25% platform fee", () => {
    // binx-api modules/invoicing/fees.py::PLATFORM_FEE_BPS
    expect(PLATFORM_FEE_BPS).toBe(125);
    expect(PLATFORM_FEE_LABEL).toBe("1.25%");
    expect(STRIPE_ESTIMATE_LABEL).toBe("2.9% + 30¢");
  });

  it("formats basis points without trailing zeros", () => {
    expect(formatBps(125)).toBe("1.25%");
    expect(formatBps(290)).toBe("2.9%");
    expect(formatBps(300)).toBe("3%");
  });

  it("nets out Stripe's estimate and Binx's fee", () => {
    // The same $2,500.00 worked example the API tests use.
    expect(estimateOnlinePayment(250_000)).toEqual({
      grossCents: 250_000,
      stripeFeeCents: 7_280,
      platformFeeCents: 3_125,
      netCents: 239_595,
    });
  });

  it("rounds the platform fee half-up to the cent", () => {
    expect(estimateOnlinePayment(40).platformFeeCents).toBe(1);
    expect(estimateOnlinePayment(39).platformFeeCents).toBe(0);
  });

  it("never takes more than the payment", () => {
    const tiny = estimateOnlinePayment(20);
    expect(tiny.stripeFeeCents).toBe(20);
    expect(tiny.netCents).toBe(0);
  });

  it("charges nothing on nothing", () => {
    expect(estimateOnlinePayment(0)).toEqual({
      grossCents: 0,
      stripeFeeCents: 0,
      platformFeeCents: 0,
      netCents: 0,
    });
    expect(estimateOnlinePayment(-100).netCents).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/invoicing", () => ({
  updateBillingSettings: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  issueInvoice: vi.fn(),
  voidInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  addInvoicePayment: vi.fn(),
  deleteInvoicePayment: vi.fn(),
  startStripeConnectOnboarding: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import * as invoicing from "@/lib/invoicing";

import {
  createInvoiceAction,
  issueInvoiceAction,
  addInvoicePaymentAction,
  startStripeConnectOnboardingAction,
} from "./actions";

const agencyId = "a1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invoices actions", () => {
  it("returns the invoice on success", async () => {
    vi.mocked(invoicing.createInvoice).mockResolvedValueOnce({ id: "inv-1" } as never);
    const result = await createInvoiceAction(agencyId, {
      clientId: "c1",
      projectId: null,
      issueDate: null,
      dueDate: null,
      discountAmountCents: null,
      discountPercent: null,
      taxRatePercent: "0",
      notes: null,
      paymentInstructions: null,
      lineItems: [],
    });
    expect(result).toEqual({ invoice: { id: "inv-1" } });
  });

  it("maps an AuthApiError to its message", async () => {
    vi.mocked(invoicing.issueInvoice).mockRejectedValueOnce(
      new AuthApiError("Add at least one line item before issuing", 409),
    );
    const result = await issueInvoiceAction(agencyId, "inv-1", false);
    expect(result).toEqual({ error: "Add at least one line item before issuing" });
  });

  it("falls back to a generic message for an unknown error", async () => {
    vi.mocked(invoicing.addInvoicePayment).mockRejectedValueOnce(new Error("boom"));
    const result = await addInvoicePaymentAction(agencyId, "inv-1", {
      amountCents: 1000,
      paidOn: "2026-01-01",
      method: "check",
      reference: null,
    });
    expect(result).toEqual({ error: "Unable to record payment" });
  });

  it("startStripeConnectOnboardingAction returns the onboarding URL", async () => {
    vi.mocked(invoicing.startStripeConnectOnboarding).mockResolvedValueOnce("https://connect.stripe.com/setup/x");
    const result = await startStripeConnectOnboardingAction(agencyId);
    expect(result).toEqual({ redirectUrl: "https://connect.stripe.com/setup/x" });
  });

  it("startStripeConnectOnboardingAction maps an AuthApiError to its message", async () => {
    vi.mocked(invoicing.startStripeConnectOnboarding).mockRejectedValueOnce(
      new AuthApiError("Stripe isn't configured", 503),
    );
    const result = await startStripeConnectOnboardingAction(agencyId);
    expect(result).toEqual({ error: "Stripe isn't configured" });
  });
});

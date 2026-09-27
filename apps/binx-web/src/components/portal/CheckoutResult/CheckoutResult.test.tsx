import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockedRefresh }),
  usePathname: () => "/portal/invoices/i1",
}));
vi.mock("@/app/(portal)/portal/invoices/actions", () => ({ confirmPaymentAction: vi.fn() }));

import { confirmPaymentAction } from "@/app/(portal)/portal/invoices/actions";
import CheckoutResult from "./CheckoutResult";

const mockedConfirm = vi.mocked(confirmPaymentAction);

function renderResult(status: "success" | "cancel" | undefined, sessionId?: string) {
  return render(
    <CheckoutResult
      status={status}
      sessionId={sessionId}
      invoiceId="i1"
      invoiceNumber="INV-0001"
      agencyName="Northlight"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/portal/invoices/i1?checkout=success&session_id=cs_1");
});

describe("CheckoutResult", () => {
  it("does nothing on a normal visit", () => {
    renderResult(undefined);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it("confirms with Stripe, then shows the payment as successful", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof confirmPaymentAction>>) => void;
    mockedConfirm.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    renderResult("success", "cs_1");

    expect(await screen.findByRole("heading", { name: "Confirming your payment…" })).toBeInTheDocument();
    // Can't be dismissed mid-check.
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(mockedConfirm).toHaveBeenCalledWith("i1", "cs_1");
    // The query string is gone, so a reload won't replay this.
    expect(window.location.search).toBe("");

    resolve({ outcome: "paid", amountPaidCents: 925000, currency: "USD" });
    expect(await screen.findByRole("heading", { name: "Payment successful" })).toBeInTheDocument();
    expect(screen.getByText(/\$9,250\.00 paid for invoice INV-0001/)).toBeInTheDocument();
    expect(mockedRefresh).toHaveBeenCalled();
  });

  it.each([
    ["processing", "Payment processing"],
    ["failed", "Payment didn't go through"],
    ["open", "Payment canceled"],
  ] as const)("shows %s outcomes without refreshing", async (outcome, heading) => {
    mockedConfirm.mockResolvedValueOnce({ outcome });
    renderResult("success", "cs_1");
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("shows the error and retries the check on demand", async () => {
    const user = userEvent.setup();
    mockedConfirm.mockResolvedValueOnce({ error: "We couldn't confirm your payment with Stripe" });
    renderResult("success", "cs_1");

    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("We couldn't confirm your payment with Stripe")).toBeInTheDocument();

    mockedConfirm.mockResolvedValueOnce({ outcome: "paid", amountPaidCents: 100, currency: "USD" });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Payment successful" })).toBeInTheDocument();
    expect(mockedConfirm).toHaveBeenCalledTimes(2);
  });

  it("tells the client nothing was charged when they cancel", async () => {
    const user = userEvent.setup();
    renderResult("cancel");
    expect(await screen.findByRole("heading", { name: "Payment canceled" })).toBeInTheDocument();
    expect(screen.getByText(/No charge was made/)).toBeInTheDocument();
    expect(mockedConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("falls back to 'processing' for a success link without a session id", async () => {
    renderResult("success");
    expect(await screen.findByRole("heading", { name: "Payment processing" })).toBeInTheDocument();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });
});

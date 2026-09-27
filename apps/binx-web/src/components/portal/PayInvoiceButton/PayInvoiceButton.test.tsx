import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(portal)/portal/invoices/actions", () => ({ payInvoiceAction: vi.fn() }));

import { payInvoiceAction } from "@/app/(portal)/portal/invoices/actions";
import PayInvoiceButton from "./PayInvoiceButton";

const mockedPay = vi.mocked(payInvoiceAction);

function renderButton(stripeReady: boolean, amountDueCents = 100) {
  return render(
    <PayInvoiceButton
      invoiceId="i1"
      invoiceNumber="INV-0007"
      amountDueCents={amountDueCents}
      currency="USD"
      agencyName="Acme"
      stripeReady={stripeReady}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const location = { href: "", assign: vi.fn((url: string) => (location.href = url)) };
  Object.defineProperty(window, "location", { value: location, writable: true });
});

describe("PayInvoiceButton", () => {
  it("shows the amount due when Stripe is ready", () => {
    renderButton(true, 12300);
    const button = screen.getByRole("button", { name: /Pay \$123\.00 now/ });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(screen.queryByText(/isn't set up yet/)).not.toBeInTheDocument();
  });

  it("is disabled with an explanatory note when Stripe isn't connected yet", () => {
    renderButton(false);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/isn't set up yet — contact Acme/)).toBeInTheDocument();
  });

  it("does not call the action when clicked while not ready", async () => {
    renderButton(false);
    await userEvent.click(screen.getByRole("button"));
    expect(mockedPay).not.toHaveBeenCalled();
  });

  it("redirects to the Stripe checkout URL on success", async () => {
    mockedPay.mockResolvedValueOnce({ checkoutUrl: "https://checkout.stripe.com/abc" });
    renderButton(true);
    await userEvent.click(screen.getByRole("button"));
    expect(mockedPay).toHaveBeenCalledWith("i1");
    expect(window.location.href).toBe("https://checkout.stripe.com/abc");
  });

  it("explains a failure in a modal, with a retry, and does not redirect", async () => {
    const user = userEvent.setup();
    mockedPay.mockResolvedValueOnce({ error: "Online payment isn't set up for this agency yet" });
    renderButton(true);

    await user.click(screen.getByRole("button", { name: /Pay .* now/ }));

    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("Online payment isn't set up for this agency yet")).toBeInTheDocument();
    expect(window.location.href).toBe("");

    mockedPay.mockResolvedValueOnce({ checkoutUrl: "https://checkout.stripe.com/retry" });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(window.location.href).toBe("https://checkout.stripe.com/retry"));
    expect(mockedPay).toHaveBeenCalledTimes(2);
  });
});

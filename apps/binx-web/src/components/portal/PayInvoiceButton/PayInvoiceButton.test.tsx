import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(portal)/portal/invoices/actions", () => ({ payInvoiceAction: vi.fn() }));

import { payInvoiceAction } from "@/app/(portal)/portal/invoices/actions";
import { toast } from "sonner";
import PayInvoiceButton from "./PayInvoiceButton";

const mockedPay = vi.mocked(payInvoiceAction);

beforeEach(() => {
  vi.clearAllMocks();
  const location = { href: "", assign: vi.fn((url: string) => (location.href = url)) };
  Object.defineProperty(window, "location", { value: location, writable: true });
});

describe("PayInvoiceButton", () => {
  it("shows the amount due when Stripe is ready", () => {
    render(
      <PayInvoiceButton invoiceId="i1" amountDueCents={12300} currency="USD" agencyName="Acme" stripeReady={true} />,
    );
    const button = screen.getByRole("button", { name: /Pay \$123\.00 now/ });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(screen.queryByText(/isn't set up yet/)).not.toBeInTheDocument();
  });

  it("is disabled with an explanatory note when Stripe isn't connected yet", () => {
    render(
      <PayInvoiceButton invoiceId="i1" amountDueCents={100} currency="USD" agencyName="Acme" stripeReady={false} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText(/isn't set up yet — contact Acme/)).toBeInTheDocument();
  });

  it("does not call the action when clicked while not ready", async () => {
    render(
      <PayInvoiceButton invoiceId="i1" amountDueCents={100} currency="USD" agencyName="Acme" stripeReady={false} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(mockedPay).not.toHaveBeenCalled();
  });

  it("redirects to the Stripe checkout URL on success", async () => {
    mockedPay.mockResolvedValueOnce({ checkoutUrl: "https://checkout.stripe.com/abc" });
    render(
      <PayInvoiceButton invoiceId="i1" amountDueCents={100} currency="USD" agencyName="Acme" stripeReady={true} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(mockedPay).toHaveBeenCalledWith("i1");
    expect(window.location.href).toBe("https://checkout.stripe.com/abc");
  });

  it("toasts an error and does not redirect on failure", async () => {
    mockedPay.mockResolvedValueOnce({ error: "Online payment isn't set up for this agency yet" });
    render(
      <PayInvoiceButton invoiceId="i1" amountDueCents={100} currency="USD" agencyName="Acme" stripeReady={true} />,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(toast.error).toHaveBeenCalledWith("Online payment isn't set up for this agency yet");
    expect(window.location.href).toBe("");
  });
});

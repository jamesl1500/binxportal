import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { InvoiceDetail } from "@/lib/invoicing";

import PaymentFeesCard from "./PaymentFeesCard";

const estimate = {
  gross_cents: 250_000,
  stripe_fee_cents: 7_280,
  platform_fee_cents: 3_125,
  net_cents: 239_595,
  stripe_fee_estimated: true,
};

const baseFees = {
  platform_fee_bps: 125,
  stripe_estimate_bps: 290,
  stripe_estimate_fixed_cents: 30,
  online_payments_enabled: true,
  if_paid_online: estimate,
  collected_online: null,
};

function invoiceWith(fees: InvoiceDetail["fees"]): InvoiceDetail {
  return { id: "inv-1", number: "INV-0001", currency: "USD", fees } as InvoiceDetail;
}

describe("PaymentFeesCard", () => {
  it("renders nothing without a fees block (the portal never gets one)", () => {
    const { container } = render(<PaymentFeesCard invoice={invoiceWith(null)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there's nothing paid or due", () => {
    const { container } = render(
      <PaymentFeesCard invoice={invoiceWith({ ...baseFees, if_paid_online: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("estimates what the agency keeps before payment", () => {
    render(<PaymentFeesCard invoice={invoiceWith(baseFees)} />);
    const breakdown = screen.getByRole("heading", { name: "If your client pays online" }).parentElement!;
    expect(within(breakdown).getByText("Client pays").nextSibling).toHaveTextContent("$2,500.00");
    expect(within(breakdown).getByText("Stripe processing (estimated)").nextSibling).toHaveTextContent(
      "−≈ $72.80",
    );
    expect(within(breakdown).getByText("Binx fee (1.25%)").nextSibling).toHaveTextContent("−$31.25");
    expect(within(breakdown).getByText("You keep").nextSibling).toHaveTextContent("≈ $2,395.95");
    expect(screen.getByText(/standard US card rate \(2\.9% \+ 30¢\)/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /connect stripe/i })).not.toBeInTheDocument();
  });

  it("shows what Stripe actually charged on a paid invoice", () => {
    render(
      <PaymentFeesCard
        invoice={invoiceWith({
          ...baseFees,
          if_paid_online: null,
          collected_online: {
            gross_cents: 250_000,
            stripe_fee_cents: 7_530,
            platform_fee_cents: 3_125,
            net_cents: 239_345,
            stripe_fee_estimated: false,
          },
        })}
      />,
    );
    const breakdown = screen.getByRole("heading", { name: "Paid online" }).parentElement!;
    expect(within(breakdown).getByText("Client paid")).toBeInTheDocument();
    expect(within(breakdown).getByText("Stripe processing").nextSibling).toHaveTextContent("−$75.30");
    expect(within(breakdown).getByText("You kept").nextSibling).toHaveTextContent(/^\$2,393\.45$/);
    expect(screen.queryByText("If your client pays online")).not.toBeInTheDocument();
  });

  it("splits paid and still-due amounts", () => {
    render(
      <PaymentFeesCard
        invoice={invoiceWith({
          ...baseFees,
          collected_online: { ...estimate, stripe_fee_estimated: false },
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Paid online" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "If the rest is paid online" })).toBeInTheDocument();
  });

  it("points to Stripe setup when clients can't pay online yet", () => {
    render(<PaymentFeesCard invoice={invoiceWith({ ...baseFees, online_payments_enabled: false })} />);
    expect(screen.getByRole("link", { name: /connect stripe/i })).toHaveAttribute(
      "href",
      "/settings/invoicing",
    );
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

vi.mock("@/app/(app)/invoices/actions", () => ({
  createInvoiceAction: vi.fn(),
  updateInvoiceAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { createInvoiceAction } from "@/app/(app)/invoices/actions";
import type { BillingSettings } from "@/lib/invoicing";

import InvoiceForm from "./InvoiceForm";

const mockedCreate = vi.mocked(createInvoiceAction);

const settings: BillingSettings = {
  agency_id: "a1",
  legal_name: null,
  address: null,
  tax_id: null,
  contact_email: null,
  currency: "USD",
  invoice_prefix: "INV-",
  next_invoice_number: 1,
  number_padding: 4,
  default_due_days: 14,
  default_tax_rate_percent: "0",
  payment_instructions: null,
  default_notes: null,
};

const clients = [{ id: "c1", name: "Globex" }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InvoiceForm", () => {
  it("computes live totals matching the backend formula", async () => {
    const user = userEvent.setup();
    render(<InvoiceForm agencyId="a1" clients={clients} projects={[]} billingSettings={settings} />);

    await user.type(screen.getByLabelText("Line 1 description"), "Design");
    await user.clear(screen.getByLabelText("Line 1 quantity"));
    await user.type(screen.getByLabelText("Line 1 quantity"), "10");
    await user.type(screen.getByLabelText("Line 1 unit price"), "150");

    // subtotal 10 * $150 = $1,500 (shown as the line amount and the subtotal)
    expect(screen.getAllByText("$1,500.00").length).toBeGreaterThanOrEqual(1);

    await user.selectOptions(screen.getByLabelText("Discount"), "percent");
    await user.type(screen.getByLabelText("Discount value"), "10");
    // 10% of 1500 = 150 -> Total $1,350
    expect(screen.getByText("−$150.00")).toBeInTheDocument();
    expect(screen.getByText("$1,350.00")).toBeInTheDocument();
  });

  it("previews what the agency keeps if the client pays online", async () => {
    const user = userEvent.setup();
    render(<InvoiceForm agencyId="a1" clients={clients} projects={[]} billingSettings={settings} />);
    // Nothing to preview on an empty invoice.
    expect(screen.queryByLabelText("If your client pays online")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Line 1 description"), "Brand identity");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2500");

    const payout = screen.getByLabelText("If your client pays online");
    // $2,500: Stripe ~ 2.9% + 30c = $72.80, Binx 1.25% = $31.25.
    expect(payout).toHaveTextContent("Stripe processing (estimated)−≈ $72.80");
    expect(payout).toHaveTextContent("Binx fee (1.25%)−$31.25");
    expect(payout).toHaveTextContent("You keep≈ $2,395.95");
  });

  it("submits the line items and totals inputs", async () => {
    mockedCreate.mockResolvedValueOnce({ invoice: { id: "inv-1" } as never });
    const user = userEvent.setup();
    render(<InvoiceForm agencyId="a1" clients={clients} projects={[]} billingSettings={settings} />);

    await user.type(screen.getByLabelText("Line 1 description"), "Retainer");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2000");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        clientId: "c1",
        lineItems: [{ description: "Retainer", quantity: "1", unitPriceCents: 200000, serviceId: null }],
      }),
    );
    expect(mockPush).toHaveBeenCalledWith("/invoices/inv-1");
  });

  it("won't submit with no described line", async () => {
    const user = userEvent.setup();
    render(<InvoiceForm agencyId="a1" clients={clients} projects={[]} billingSettings={settings} />);

    expect(screen.getByRole("button", { name: /create draft/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /create draft/i }));
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("adds a catalog service as a line, copying only name, quantity and price", async () => {
    mockedCreate.mockResolvedValueOnce({ invoice: { id: "inv-1" } as never });
    const user = userEvent.setup();
    const services = [
      {
        id: "svc-1",
        agency_id: "a1",
        name: "Design retainer",
        description: "Shown on proposals only",
        pricing_type: "monthly",
        unit_price_cents: 200000,
        default_quantity: "1.00",
        is_archived: false,
        created_at: "2026-11-01T00:00:00Z",
      },
    ];
    render(
      <InvoiceForm
        agencyId="a1"
        clients={[{ id: "c1", name: "Acme" }]}
        projects={[]}
        billingSettings={settings}
        services={services}
      />,
    );

    expect(screen.getByRole("option", { name: /Design retainer · \$2,000\.00 \/ mo/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Add from services"), "svc-1");
    expect(screen.getByLabelText("Line 1 description")).toHaveValue("Design retainer");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        lineItems: [{ description: "Design retainer", quantity: "1", unitPriceCents: 200000, serviceId: "svc-1" }],
      }),
    );
  });
});

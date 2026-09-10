import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, refresh: vi.fn() }),
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
        lineItems: [{ description: "Retainer", quantity: "1", unitPriceCents: 200000 }],
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
});

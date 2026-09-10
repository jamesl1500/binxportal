import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import type { Invoice } from "@/lib/invoicing";

import InvoiceTable from "./InvoiceTable";

function makeInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: "i1",
    agency_id: "a1",
    client_id: "c1",
    client_name: "Globex",
    project_id: null,
    project_name: null,
    number: "INV-0001",
    status: "sent",
    display_status: "sent",
    currency: "USD",
    issue_date: "2026-06-01",
    due_date: "2026-06-15",
    subtotal_cents: 10000,
    discount_cents: 0,
    tax_cents: 0,
    total_cents: 10000,
    amount_paid_cents: 0,
    amount_due_cents: 10000,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("InvoiceTable", () => {
  it("renders rows and the total", () => {
    render(<InvoiceTable invoices={[makeInvoice({ number: "INV-0002", total_cents: 342563 })]} />);
    expect(screen.getByText("INV-0002")).toBeInTheDocument();
    expect(screen.getByText("$3,425.63")).toBeInTheDocument();
  });

  it("shows the server-derived overdue label", () => {
    render(<InvoiceTable invoices={[makeInvoice({ display_status: "overdue" })]} />);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(
      <InvoiceTable
        invoices={[
          makeInvoice({ id: "a", number: "INV-1", display_status: "paid" }),
          makeInvoice({ id: "b", number: "INV-2", display_status: "draft" }),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Paid \(1\)/ }));
    expect(screen.getByText("INV-1")).toBeInTheDocument();
    expect(screen.queryByText("INV-2")).not.toBeInTheDocument();
  });

  it("hides the client column when showClient is false", () => {
    render(<InvoiceTable invoices={[makeInvoice({})]} showClient={false} />);
    expect(screen.queryByRole("button", { name: /Client/ })).not.toBeInTheDocument();
  });
});

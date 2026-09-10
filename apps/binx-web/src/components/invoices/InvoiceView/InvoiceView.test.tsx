import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { InvoiceDetail } from "@/lib/invoicing";
import InvoiceView from "./InvoiceView";

const base = {
  number: "INV-0007",
  display_status: "sent",
  issue_date: "2026-01-01",
  due_date: "2026-01-15",
  project_name: null,
  currency: "USD",
  from: { name: "Studio LLC", address: "1 Main St", email: "b@studio.test", tax_id: "TX1" },
  bill_to: { name: "Acme Co", address: "2 Elm St", email: "ap@acme.test" },
  line_items: [
    { id: "li1", description: "Design", quantity: "2", unit_price_cents: 5000, amount_cents: 10000 },
    { id: "li2", description: "Build", quantity: "1.5", unit_price_cents: 10000, amount_cents: 15000 },
  ],
  subtotal_cents: 25000,
  discount_cents: 0,
  discount_percent: null,
  tax_cents: 0,
  tax_rate_percent: "0",
  total_cents: 25000,
  amount_paid_cents: 0,
  amount_due_cents: 25000,
  payments: [],
  notes: null,
  payment_instructions: null,
} as unknown as InvoiceDetail;

describe("InvoiceView", () => {
  it("renders the header, parties and line items", () => {
    render(<InvoiceView invoice={base} />);
    expect(screen.getByRole("heading", { level: 1, name: "INV-0007" })).toBeInTheDocument();
    expect(screen.getByText("Studio LLC")).toBeInTheDocument();
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByText("Tax ID: TX1")).toBeInTheDocument();
    // integer quantity is shown without decimals, non-integer as-is
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1.5" })).toBeInTheDocument();
    // subtotal + total both read $250.00 (25000 cents)
    expect(screen.getAllByText("$250.00").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the empty line-items row", () => {
    render(<InvoiceView invoice={{ ...base, line_items: [] }} />);
    expect(screen.getByText("No line items yet.")).toBeInTheDocument();
  });

  it("shows discount, tax, paid, balance, payments, notes and instructions when present", () => {
    render(
      <InvoiceView
        invoice={{
          ...base,
          project_name: "Rebrand",
          discount_cents: 2500,
          discount_percent: "10",
          tax_cents: 1000,
          tax_rate_percent: "5",
          amount_paid_cents: 10000,
          amount_due_cents: 15000,
          payments: [
            {
              id: "p1",
              invoice_id: "inv",
              paid_on: "2026-01-10",
              method: "bank_transfer",
              reference: "REF9",
              amount_cents: 10000,
              recorded_by_name: "Morgan",
              created_at: "2026-01-10T00:00:00Z",
            },
          ],
          notes: "Thanks!",
          payment_instructions: "Wire to …",
        }}
      />,
    );
    expect(screen.getByText("Rebrand")).toBeInTheDocument();
    expect(screen.getByText(/Discount/)).toHaveTextContent("10%");
    expect(screen.getByText(/Tax \(5%\)/)).toBeInTheDocument();
    expect(screen.getByText("Balance due")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByText("REF9")).toBeInTheDocument();
    expect(screen.getByText("Thanks!")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payment instructions" })).toBeInTheDocument();
  });

  it("falls back to an em dash when the from-name is missing", () => {
    render(<InvoiceView invoice={{ ...base, from: { ...base.from, name: null } }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

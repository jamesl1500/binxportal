import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/invoices/actions", () => ({ updateBillingSettingsAction: vi.fn() }));

import { updateBillingSettingsAction } from "@/app/(app)/invoices/actions";
import BillingSettingsForm from "./BillingSettingsForm";

const mocked = vi.mocked(updateBillingSettingsAction);

const settings = {
  legal_name: "Studio LLC",
  address: "1 Main St",
  tax_id: "TX1",
  contact_email: "b@studio.test",
  currency: "USD",
  invoice_prefix: "INV-",
  next_invoice_number: 5,
  number_padding: 4,
  default_due_days: 14,
  default_tax_rate_percent: "0",
  payment_instructions: "Bank transfer",
  default_notes: "Thanks",
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("BillingSettingsForm", () => {
  it("shows a read-only summary for a non-manager", () => {
    render(<BillingSettingsForm agencyId="a1" settings={settings} canManage={false} />);
    expect(screen.getByText(/only an owner or admin/i)).toBeInTheDocument();
    expect(screen.getByText("INV-0005")).toBeInTheDocument();
    expect(screen.getByText(/Net 14 days · 0% tax/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("prefills the editable form for a manager", () => {
    render(<BillingSettingsForm agencyId="a1" settings={settings} canManage />);
    expect(screen.getByLabelText("Billing name")).toHaveValue("Studio LLC");
    expect(screen.getByLabelText("Next number")).toHaveValue(5);
  });

  it("saves a normalised payload and confirms", async () => {
    render(<BillingSettingsForm agencyId="a1" settings={settings} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Save billing settings" }));
    expect(mocked).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ currency: "USD", nextInvoiceNumber: 5, defaultTaxRatePercent: "0" }),
    );
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks an invalid currency code", async () => {
    render(<BillingSettingsForm agencyId="a1" settings={settings} canManage />);
    const currency = screen.getByLabelText("Currency");
    await userEvent.clear(currency);
    await userEvent.type(currency, "US");
    await userEvent.click(screen.getByRole("button", { name: "Save billing settings" }));
    expect(await screen.findByText("3-letter currency code")).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("surfaces a server error", async () => {
    mocked.mockResolvedValueOnce({ error: "Not permitted" } as never);
    render(<BillingSettingsForm agencyId="a1" settings={settings} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Save billing settings" }));
    expect(await screen.findByText("Not permitted")).toBeInTheDocument();
  });
});

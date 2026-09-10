import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/invoices/actions", () => ({ addInvoicePaymentAction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { addInvoicePaymentAction } from "@/app/(app)/invoices/actions";
import type { InvoiceDetail } from "@/lib/invoicing";

import RecordPaymentDialog from "./RecordPaymentDialog";

const mockedAdd = vi.mocked(addInvoicePaymentAction);

const invoice = {
  id: "inv-1",
  number: "INV-0001",
  currency: "USD",
  amount_due_cents: 285000,
} as InvoiceDetail;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecordPaymentDialog", () => {
  it("prefills the amount to the outstanding balance and submits", async () => {
    mockedAdd.mockResolvedValueOnce({ invoice });
    const user = userEvent.setup();
    render(<RecordPaymentDialog agencyId="a1" invoice={invoice} open onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText("Amount")).toHaveValue(2850);

    await user.selectOptions(screen.getByLabelText("Method"), "check");
    await user.type(screen.getByLabelText("Reference (optional)"), "1042");
    await user.click(screen.getByRole("button", { name: /record payment/i }));

    expect(mockedAdd).toHaveBeenCalledWith(
      "a1",
      "inv-1",
      expect.objectContaining({ amountCents: 285000, method: "check", reference: "1042" }),
    );
  });
});

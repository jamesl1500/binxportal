import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(portal)/portal/invoices/actions", () => ({ payInvoiceAction: vi.fn() }));

import { payInvoiceAction } from "@/app/(portal)/portal/invoices/actions";
import { toast } from "sonner";
import PayInvoiceButton from "./PayInvoiceButton";

const mockedPay = vi.mocked(payInvoiceAction);

beforeEach(() => vi.clearAllMocks());

describe("PayInvoiceButton", () => {
  it("shows the amount due and the demo notice", () => {
    render(<PayInvoiceButton invoiceId="i1" amountDueCents={12300} currency="USD" />);
    expect(screen.getByRole("button", { name: /Pay \$123\.00 now/ })).toBeInTheDocument();
    expect(screen.getByText(/demo payment/i)).toBeInTheDocument();
  });

  it("records the payment and refreshes on success", async () => {
    mockedPay.mockResolvedValueOnce({} as never);
    render(<PayInvoiceButton invoiceId="i1" amountDueCents={100} currency="USD" />);
    await userEvent.click(screen.getByRole("button"));
    expect(mockedPay).toHaveBeenCalledWith("i1");
    expect(toast.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("toasts an error and does not refresh on failure", async () => {
    mockedPay.mockResolvedValueOnce({ error: "Card declined" } as never);
    render(<PayInvoiceButton invoiceId="i1" amountDueCents={100} currency="USD" />);
    await userEvent.click(screen.getByRole("button"));
    expect(toast.error).toHaveBeenCalledWith("Card declined");
    expect(refresh).not.toHaveBeenCalled();
  });
});

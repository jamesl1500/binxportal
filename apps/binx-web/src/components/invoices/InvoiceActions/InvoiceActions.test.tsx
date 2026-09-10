import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/invoices/RecordPaymentDialog/RecordPaymentDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>record-payment-dialog</div> : null),
}));
vi.mock("@/app/(app)/invoices/actions", () => ({
  deleteInvoiceAction: vi.fn(),
  issueInvoiceAction: vi.fn(),
  voidInvoiceAction: vi.fn(),
}));

import { deleteInvoiceAction, issueInvoiceAction, voidInvoiceAction } from "@/app/(app)/invoices/actions";
import { toast } from "sonner";
import InvoiceActions from "./InvoiceActions";

const del = vi.mocked(deleteInvoiceAction);
const issue = vi.mocked(issueInvoiceAction);
const voidIt = vi.mocked(voidInvoiceAction);

const invoice = (status: string) => ({ id: "i1", number: "INV-0001", status }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  del.mockResolvedValue({} as never);
  issue.mockResolvedValue({} as never);
  voidIt.mockResolvedValue({} as never);
});

describe("InvoiceActions", () => {
  it("draft + canManage shows Edit, Delete and Issue", () => {
    render(<InvoiceActions agencyId="a1" invoice={invoice("draft")} canManage clientHasEmail />);
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/invoices/i1/edit");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue invoice" })).toBeInTheDocument();
  });

  it("draft without canManage shows only the hint", () => {
    render(<InvoiceActions agencyId="a1" invoice={invoice("draft")} canManage={false} clientHasEmail />);
    expect(screen.queryByRole("button", { name: "Issue invoice" })).toBeNull();
    expect(screen.getByText(/owner or admin issues invoices/i)).toBeInTheDocument();
  });

  it("deletes a draft through the action", async () => {
    render(<InvoiceActions agencyId="a1" invoice={invoice("draft")} canManage clientHasEmail />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(del).toHaveBeenCalledWith("a1", "i1");
    expect(refresh).toHaveBeenCalled();
  });

  it("issues a draft via the confirm dialog", async () => {
    render(<InvoiceActions agencyId="a1" invoice={invoice("draft")} canManage clientHasEmail />);
    await userEvent.click(screen.getByRole("button", { name: "Issue invoice" }));
    // Dialog is open — its own "Issue invoice" button plus a title.
    expect(await screen.findByText("Issue INV-0001?")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Issue invoice" }).at(-1)!);
    expect(issue).toHaveBeenCalledWith("a1", "i1", false);
  });

  it("sent invoice shows Record payment and Void", async () => {
    render(<InvoiceActions agencyId="a1" invoice={invoice("sent")} canManage clientHasEmail />);
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(screen.getByText("record-payment-dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Void" }));
    expect(await screen.findByText("Void INV-0001?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Void invoice" }));
    expect(voidIt).toHaveBeenCalledWith("a1", "i1");
  });

  it("void invoice shows only the voided hint", () => {
    render(<InvoiceActions agencyId="a1" invoice={invoice("void")} canManage clientHasEmail />);
    expect(screen.getByText("This invoice was voided.")).toBeInTheDocument();
  });

  it("toasts an error the action returns", async () => {
    del.mockResolvedValueOnce({ error: "Cannot delete an issued invoice" } as never);
    render(<InvoiceActions agencyId="a1" invoice={invoice("draft")} canManage clientHasEmail />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(toast.error).toHaveBeenCalledWith("Cannot delete an issued invoice");
  });
});

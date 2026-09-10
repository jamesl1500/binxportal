import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/invoices/actions", () => ({
  generateInvoiceReminderAction: vi.fn(),
}));

import { generateInvoiceReminderAction } from "@/app/(app)/invoices/actions";
import type { InvoiceDetail } from "@/lib/invoicing";

import AiReminderCard from "./AiReminderCard";

const mockedGenerate = vi.mocked(generateInvoiceReminderAction);

const sentInvoice = {
  id: "inv-1",
  number: "INV-0001",
  status: "sent",
  display_status: "overdue",
  bill_to: { name: "Globex", address: null, email: "ap@globex.example" },
} as InvoiceDetail;

const draftInvoice = { ...sentInvoice, status: "draft", display_status: "draft" } as InvoiceDetail;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiReminderCard", () => {
  it("renders nothing for a draft invoice", () => {
    const { container } = render(<AiReminderCard agencyId="a1" invoice={draftInvoice} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mentions overdue for an overdue invoice", () => {
    render(<AiReminderCard agencyId="a1" invoice={sentInvoice} />);
    expect(screen.getByText(/this invoice is overdue/i)).toBeInTheDocument();
  });

  it("drafts a reminder and offers copy + a mailto link", async () => {
    mockedGenerate.mockResolvedValueOnce({ draft: "Just a friendly reminder…" });
    const user = userEvent.setup();
    render(<AiReminderCard agencyId="a1" invoice={sentInvoice} />);

    await user.click(screen.getByRole("button", { name: /draft reminder/i }));

    expect(await screen.findByRole("textbox")).toHaveValue("Just a friendly reminder…");
    expect(mockedGenerate).toHaveBeenCalledWith("a1", "inv-1");

    const mailLink = screen.getByRole("link", { name: /open in email/i });
    expect(mailLink).toHaveAttribute("href", expect.stringContaining("mailto:ap@globex.example"));

    await user.click(screen.getByRole("button", { name: /copy to clipboard/i }));
    await expect(navigator.clipboard.readText()).resolves.toBe("Just a friendly reminder…");
  });

  it("omits the mailto link when the client has no email on file", async () => {
    mockedGenerate.mockResolvedValueOnce({ draft: "Reminder text." });
    const user = userEvent.setup();
    render(
      <AiReminderCard
        agencyId="a1"
        invoice={{ ...sentInvoice, bill_to: { name: "Globex", address: null, email: null } } as InvoiceDetail}
      />,
    );

    await user.click(screen.getByRole("button", { name: /draft reminder/i }));
    await screen.findByRole("textbox");

    expect(screen.queryByRole("link", { name: /open in email/i })).not.toBeInTheDocument();
  });
});

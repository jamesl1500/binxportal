import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, refresh: vi.fn() }),
}));

vi.mock("@/app/(app)/proposals/actions", () => ({
  createProposalAction: vi.fn(),
  updateProposalAction: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { createProposalAction } from "@/app/(app)/proposals/actions";

import ProposalForm from "./ProposalForm";

const mockedCreate = vi.mocked(createProposalAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalForm", () => {
  it("computes live totals matching the backend formula", async () => {
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" />);

    await user.type(screen.getByLabelText(/^Title$/), "Website redesign");
    await user.type(screen.getByLabelText("Line 1 description"), "Design");
    await user.clear(screen.getByLabelText("Line 1 quantity"));
    await user.type(screen.getByLabelText("Line 1 quantity"), "10");
    await user.type(screen.getByLabelText("Line 1 unit price"), "150");

    // subtotal 10 * $150 = $1,500 (shown as the line amount and the subtotal)
    expect(screen.getAllByText("$1,500.00").length).toBeGreaterThanOrEqual(2);

    await user.clear(screen.getByLabelText("Tax rate (%)"));
    await user.type(screen.getByLabelText("Tax rate (%)"), "10");
    // 10% of 1500 = 150 -> Total $1,650
    expect(screen.getByText("$150.00")).toBeInTheDocument();
    expect(screen.getByText("$1,650.00")).toBeInTheDocument();
  });

  it("submits the line items and totals inputs", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" />);

    await user.type(screen.getByLabelText(/^Title$/), "Retainer proposal");
    await user.type(screen.getByLabelText("Line 1 description"), "Retainer");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2000");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        title: "Retainer proposal",
        leadId: null,
        clientId: null,
        lineItems: [{ description: "Retainer", quantity: "1", unitPriceCents: 200000 }],
      }),
    );
    expect(mockPush).toHaveBeenCalledWith("/proposals/p1");
  });

  it("submits with a pre-selected client from initialClientId", async () => {
    mockedCreate.mockResolvedValueOnce({ proposal: { id: "p1" } as never });
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" initialClientId="client-1" />);

    await user.type(screen.getByLabelText(/^Title$/), "Retainer proposal");
    await user.type(screen.getByLabelText("Line 1 description"), "Retainer");
    await user.type(screen.getByLabelText("Line 1 unit price"), "2000");
    await user.click(screen.getByRole("button", { name: /create draft/i }));

    expect(mockedCreate).toHaveBeenCalledWith("a1", expect.objectContaining({ clientId: "client-1" }));
  });

  it("won't submit without a title or a described line", async () => {
    const user = userEvent.setup();
    render(<ProposalForm agencyId="a1" />);

    expect(screen.getByRole("button", { name: /create draft/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /create draft/i }));
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

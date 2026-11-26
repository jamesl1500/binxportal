import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/proposals/actions", () => ({ retryProposalAcceptanceAction: vi.fn() }));

import { toast } from "sonner";

import { retryProposalAcceptanceAction } from "@/app/(app)/proposals/actions";
import type { ProposalAcceptance } from "@/lib/proposals";

import AcceptancePanel from "./AcceptancePanel";

const retry = vi.mocked(retryProposalAcceptanceAction);

function acceptance(overrides: Partial<ProposalAcceptance> = {}): ProposalAcceptance {
  return {
    status: "done",
    blocked_reason: null,
    client_id: "c1",
    client_name: "Fjord & Field",
    converted_lead: true,
    invited_email: "jane@fjord.example",
    deposit_invoice_id: null,
    deposit_invoice_number: null,
    deposit_invoice_status: null,
    deposit_paid_at: null,
    project_id: "pr1",
    project_name: "Brand refresh",
    kickoff_sent_at: null,
    completed_at: "2026-11-26T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AcceptancePanel", () => {
  it("lists what accepting set up, with links", () => {
    render(
      <AcceptancePanel agencyId="a1" proposalId="p1" acceptance={acceptance()} depositPercent={null} createsProject />,
    );
    expect(screen.getByRole("heading", { name: "Accepted and set up" })).toBeInTheDocument();
    expect(screen.getByText(/Lead converted to the client/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fjord & Field" })).toHaveAttribute("href", "/clients/c1");
    expect(screen.getByText("Client portal: jane@fjord.example")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Brand refresh" })).toHaveAttribute("href", "/projects/pr1");
  });

  it("shows the deposit holding up the project", () => {
    render(
      <AcceptancePanel
        agencyId="a1"
        proposalId="p1"
        acceptance={acceptance({
          status: "awaiting_deposit",
          deposit_invoice_id: "i1",
          deposit_invoice_number: "INV-0007",
          deposit_invoice_status: "sent",
          project_id: null,
          project_name: null,
        })}
        depositPercent="30.000"
        createsProject
      />,
    );
    expect(screen.getByRole("heading", { name: "Accepted, waiting on the deposit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "INV-0007" })).toHaveAttribute("href", "/invoices/i1");
    expect(screen.getByText(/awaiting payment/)).toBeInTheDocument();
    expect(screen.getByText("Project starts when the deposit is paid")).toBeInTheDocument();
  });

  it("explains a block and retries it", async () => {
    retry.mockResolvedValueOnce({ proposal: { acceptance: acceptance() } as never });
    const user = userEvent.setup();
    render(
      <AcceptancePanel
        agencyId="a1"
        proposalId="p1"
        acceptance={acceptance({
          status: "blocked",
          blocked_reason: "Couldn't convert the lead to a client: Your Free plan is limited to 3 clients.",
          client_id: null,
          converted_lead: false,
          invited_email: null,
          project_id: null,
        })}
        depositPercent={null}
        createsProject={false}
      />,
    );
    expect(screen.getByText(/Free plan is limited to 3 clients/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry setup" }));
    expect(retry).toHaveBeenCalledWith("a1", "p1");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says so when a retry is still blocked", async () => {
    retry.mockResolvedValueOnce({
      proposal: { acceptance: acceptance({ status: "blocked", blocked_reason: "Still over the limit" }) } as never,
    });
    const user = userEvent.setup();
    render(
      <AcceptancePanel
        agencyId="a1"
        proposalId="p1"
        acceptance={acceptance({ status: "blocked", blocked_reason: "Over the limit" })}
        depositPercent={null}
        createsProject={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Retry setup" }));
    expect(toast.error).toHaveBeenCalledWith("Still over the limit");
  });

  it("shows the monthly billing it started, and its next invoice", () => {
    render(
      <AcceptancePanel
        agencyId="a1"
        proposalId="p1"
        acceptance={acceptance({ retainer_schedule_id: "rs1", retainer_next_run_date: "2026-12-03" })}
        depositPercent={null}
        createsProject={false}
        monthlyLabel="$2,500.00 / mo"
      />,
    );
    expect(screen.getByText(/Monthly billing of \$2,500\.00 \/ mo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /next invoice December 3/ })).toHaveAttribute("href", "/invoices/recurring");
  });

  it("says monthly billing waits for the deposit", () => {
    render(
      <AcceptancePanel
        agencyId="a1"
        proposalId="p1"
        acceptance={acceptance({ status: "awaiting_deposit", deposit_invoice_id: "i1", project_id: null })}
        depositPercent="30.000"
        createsProject={false}
        monthlyLabel="$2,500.00 / mo"
      />,
    );
    expect(screen.getByText("Monthly billing starts when the deposit is paid")).toBeInTheDocument();
  });
});

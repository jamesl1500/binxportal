import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import type { Proposal } from "@/lib/proposals";

import ProposalsTable from "./ProposalsTable";

function makeProposal(overrides: Partial<Proposal>): Proposal {
  return {
    id: "p1",
    agency_id: "a1",
    client_id: "c1",
    client_name: "Globex",
    lead_id: null,
    lead_name: null,
    title: "Website redesign",
    recipient_name: "Jamie Rivera",
    recipient_email: "jamie@example.com",
    status: "sent",
    display_status: "sent",
    currency: "USD",
    subtotal_cents: 10000,
    tax_cents: 0,
    total_cents: 10000,
    valid_until: null,
    sent_at: "2026-06-01T00:00:00Z",
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProposalsTable", () => {
  it("renders rows and the total", () => {
    render(<ProposalsTable proposals={[makeProposal({ title: "Brand refresh", total_cents: 342563 })]} />);
    expect(screen.getByText("Brand refresh")).toBeInTheDocument();
    expect(screen.getByText("$3,425.63")).toBeInTheDocument();
  });

  it("shows the server-derived expired label", () => {
    render(<ProposalsTable proposals={[makeProposal({ display_status: "expired" })]} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("falls back to lead or recipient name when there's no client", () => {
    render(
      <ProposalsTable
        proposals={[makeProposal({ client_id: null, client_name: null, lead_name: "Acme Prospect" })]}
      />,
    );
    expect(screen.getByText("Acme Prospect")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(
      <ProposalsTable
        proposals={[
          makeProposal({ id: "a", title: "Signed deal", display_status: "signed" }),
          makeProposal({ id: "b", title: "Still a draft", display_status: "draft" }),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Signed \(1\)/ }));
    expect(screen.getByText("Signed deal")).toBeInTheDocument();
    expect(screen.queryByText("Still a draft")).not.toBeInTheDocument();
  });

  it("shows an empty state with no proposals", () => {
    render(<ProposalsTable proposals={[]} />);
    expect(screen.getByText("No proposals yet.")).toBeInTheDocument();
  });

  it("hides the client/lead column when showClient is false", () => {
    render(<ProposalsTable proposals={[makeProposal({})]} showClient={false} />);
    expect(screen.queryByRole("columnheader", { name: /client \/ lead/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Globex")).not.toBeInTheDocument();
  });

  it("links rows under a custom linkBase", () => {
    render(<ProposalsTable proposals={[makeProposal({ id: "p9" })]} linkBase="/portal/proposals" />);
    expect(screen.getByRole("link", { name: "Website redesign" })).toHaveAttribute(
      "href",
      "/portal/proposals/p9",
    );
  });
});

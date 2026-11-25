import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProposalDetail } from "@/lib/proposals";

import ProposalView from "./ProposalView";

function makeProposal(overrides: Partial<ProposalDetail>): ProposalDetail {
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
    content: "Full scope of work here.",
    tax_rate_percent: "0",
    viewed_at: null,
    decided_at: null,
    decline_reason: null,
    share_url: "https://app.example.com/proposals/public?token=tok",
    line_items: [
      {
        id: "li1",
        position: 0,
        description: "Design",
        details: null,
        quantity: "1",
        unit_price_cents: 10000,
        amount_cents: 10000,
        service_id: null,
      },
    ],
    attachments: [],
    signature: null,
    ...overrides,
  } as ProposalDetail;
}

describe("ProposalView", () => {
  it("renders the title, status, recipient and line items", () => {
    render(<ProposalView proposal={makeProposal({})} />);
    expect(screen.getByText("Website redesign")).toBeInTheDocument();
    expect(screen.getAllByText("Sent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("jamie@example.com")).toBeInTheDocument();
    expect(screen.getByText("Design")).toBeInTheDocument();
    expect(screen.getAllByText("$100.00").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a line's details under its description", () => {
    const [line] = makeProposal({}).line_items;
    render(
      <ProposalView proposal={makeProposal({ line_items: [{ ...line, details: "Two rounds of revisions" }] })} />,
    );
    expect(screen.getByText("Two rounds of revisions")).toBeInTheDocument();
  });

  it("lists documents through the given download route", () => {
    const attachments = [
      {
        id: "att-1",
        file_name: "contract.pdf",
        mime_type: "application/pdf",
        size: 1536,
        sha256: "a".repeat(64),
        created_at: "2026-06-01T00:00:00Z",
      },
    ];
    render(
      <ProposalView
        proposal={makeProposal({ attachments })}
        attachmentHrefBase="/api/portal/proposals/p1/attachments"
      />,
    );
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contract\.pdf/ })).toHaveAttribute(
      "href",
      "/api/portal/proposals/p1/attachments/att-1",
    );
  });

  it("leaves documents out without a download route (the draft page manages them)", () => {
    const attachments = [
      { id: "att-1", file_name: "contract.pdf", mime_type: "application/pdf", size: 1, sha256: "a", created_at: "" },
    ];
    render(<ProposalView proposal={makeProposal({ attachments })} />);
    expect(screen.queryByRole("heading", { name: "Documents" })).not.toBeInTheDocument();
  });

  it("shows signature details once signed", () => {
    render(
      <ProposalView
        proposal={makeProposal({
          status: "signed",
          display_status: "signed",
          signature: { signer_name: "Jamie Rivera", signer_email: "jamie@example.com", signed_at: "2026-06-05T00:00:00Z" },
        })}
      />,
    );
    expect(screen.getByText("Signature")).toBeInTheDocument();
    expect(screen.getByText(/Jamie Rivera · jamie@example.com/)).toBeInTheDocument();
  });

  it("shows the decline reason once declined", () => {
    render(
      <ProposalView
        proposal={makeProposal({
          status: "declined",
          display_status: "declined",
          decline_reason: "Went with another agency",
          decided_at: "2026-06-05T00:00:00Z",
        })}
      />,
    );
    expect(screen.getByText("Decline reason")).toBeInTheDocument();
    expect(screen.getByText("Went with another agency")).toBeInTheDocument();
  });
});

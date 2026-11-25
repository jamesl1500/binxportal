import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProposalAuditTrail from "./ProposalAuditTrail";

describe("ProposalAuditTrail", () => {
  it("lists each event with who, when, IP and browser", () => {
    render(
      <ProposalAuditTrail
        documentHash={"c".repeat(64)}
        events={[
          { kind: "sent", occurred_at: "2026-11-20T09:00:00Z", actor_label: "Olivia Owner", ip_address: null, user_agent: null, detail: "Sent to jane@example.com" },
          { kind: "viewed", occurred_at: "2026-11-20T10:15:00Z", actor_label: "Recipient (share link)", ip_address: "203.0.113.50", user_agent: "Mozilla/5.0 (Chrome)", detail: null },
        ]}
      />,
    );
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Opened")).toBeInTheDocument();
    expect(screen.getByText("Olivia Owner · Sent to jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("2026-11-20 10:15:00 UTC · 203.0.113.50 · Mozilla/5.0 (Chrome)")).toBeInTheDocument();
    expect(screen.getByText("c".repeat(64))).toBeInTheDocument();
  });

  it("says when nothing is recorded yet", () => {
    render(<ProposalAuditTrail documentHash={null} events={[]} />);
    expect(screen.getByText("Nothing recorded yet.")).toBeInTheDocument();
  });
});

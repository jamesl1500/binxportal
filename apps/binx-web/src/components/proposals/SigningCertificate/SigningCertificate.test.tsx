import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProposalCertificate } from "@/lib/proposals";

import SigningCertificate, { utcStamp } from "./SigningCertificate";

const HASH = "3f9a1c".padEnd(64, "0");

function certificate(overrides: Partial<ProposalCertificate> = {}): ProposalCertificate {
  return {
    proposal_id: "p1",
    agency_name: "Northlight",
    title: "Brand refresh",
    recipient_name: "Jane Prospect",
    recipient_email: "jane@example.com",
    content: "Scope: strategy and identity.",
    currency: "USD",
    tax_rate_percent: "10.000",
    subtotal_cents: 500000,
    tax_cents: 50000,
    total_cents: 550000,
    monthly_subtotal_cents: 0,
    monthly_tax_cents: 0,
    monthly_total_cents: 0,
    valid_until: null,
    sent_at: "2026-11-20T09:00:00Z",
    line_items: [
      { description: "Brand strategy", details: "Two workshops", quantity: "1.00", unit_price_cents: 500000, amount_cents: 500000, billing: "one_time" },
    ],
    attachments: [{ file_name: "sow.pdf", size: 2048, sha256: "b".repeat(64) }],
    document_hash: HASH,
    document_intact: true,
    signature_matches_document: true,
    signature: {
      signer_name: "Jane Prospect",
      signer_email: "jane@example.com",
      signature_text: "Jane Prospect",
      signed_at: "2026-11-21T14:03:22Z",
      ip_address: "203.0.113.50",
      user_agent: "Mozilla/5.0 (Chrome)",
      signed_via: "link",
      consent_version: "2026-11-25",
      consent_text: "I agree to sign this proposal electronically.",
      document_hash: HASH,
    },
    requires_countersign: false,
    countersignature: null,
    completed_at: "2026-11-21T14:03:22Z",
    events: [
      { kind: "sent", occurred_at: "2026-11-20T09:00:00Z", actor_label: "Olivia Owner", ip_address: null, user_agent: null, detail: "Sent to jane@example.com" },
      { kind: "signed", occurred_at: "2026-11-21T14:03:22Z", actor_label: "Jane Prospect <jane@example.com>", ip_address: "203.0.113.50", user_agent: "Mozilla/5.0 (Chrome)", detail: null },
    ],
    generated_at: "2026-11-25T10:00:00Z",
    ...overrides,
  };
}

describe("SigningCertificate", () => {
  it("shows the signed document, its fingerprint and the signature evidence", () => {
    render(<SigningCertificate certificate={certificate()} />);

    expect(screen.getByRole("heading", { name: "Brand refresh" })).toBeInTheDocument();
    expect(screen.getByText("The signed record matches its fingerprint.")).toBeInTheDocument();
    expect(screen.getAllByText(HASH)).toHaveLength(2); // the document's, and the one signed
    expect(screen.getByText("Two workshops")).toBeInTheDocument();
    expect(screen.getByText("$5,500.00")).toBeInTheDocument();
    expect(screen.getByText(`SHA-256 ${"b".repeat(64)}`)).toBeInTheDocument();
    expect(screen.getByText("Share link sent to the recipient")).toBeInTheDocument();
    expect(screen.getAllByText("203.0.113.50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("I agree to sign this proposal electronically.")).toBeInTheDocument();
    expect(screen.getByText(/version 2026-11-25/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print or save as pdf/i })).toBeInTheDocument();
  });

  it("lists the audit trail in UTC", () => {
    render(<SigningCertificate certificate={certificate()} />);
    const trail = screen.getByRole("heading", { name: "Audit trail" }).closest("section")!;
    expect(within(trail).getByText("2026-11-21 14:03:22 UTC")).toBeInTheDocument();
    expect(within(trail).getByText("Sent to jane@example.com")).toBeInTheDocument();
  });

  it("warns when the stored record no longer matches its fingerprint", () => {
    render(<SigningCertificate certificate={certificate({ document_intact: false })} />);
    expect(screen.getByText("The stored record no longer matches its fingerprint.")).toBeInTheDocument();
  });

  it("says when a signature predates fingerprints", () => {
    const old = certificate({
      signature_matches_document: false,
      signature: { ...certificate().signature, document_hash: null, consent_text: null, consent_version: null, signed_via: null },
    });
    render(<SigningCertificate certificate={old} />);
    expect(screen.getByText("This signature predates document fingerprints.")).toBeInTheDocument();
    // Method and the signed fingerprint weren't recorded back then.
    expect(screen.getAllByText("Not recorded", { selector: "dd" })).toHaveLength(2);
  });

  it("formats stamps as UTC regardless of the viewer's zone", () => {
    expect(utcStamp("2026-11-21T09:03:22-05:00")).toBe("2026-11-21 14:03:22 UTC");
  });

  it("shows the agency's countersignature and a PDF download", () => {
    const base = certificate();
    render(
      <SigningCertificate
        certificate={certificate({
          requires_countersign: true,
          countersignature: {
            ...base.signature,
            signer_name: "Olivia Owner",
            signer_email: "olivia@northlight.example",
            signature_text: "Olivia Owner",
            signed_via: "agency",
          },
        })}
        pdfHref="/api/proposals/a1/p1/certificate"
      />,
    );
    expect(screen.getByRole("heading", { name: "Client signature" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agency countersignature" })).toBeInTheDocument();
    expect(screen.getByText("Agency account (countersignature)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download pdf/i })).toHaveAttribute(
      "href",
      "/api/proposals/a1/p1/certificate",
    );
  });

  it("says when the countersignature is still due", () => {
    render(<SigningCertificate certificate={certificate({ requires_countersign: true, completed_at: null })} />);
    expect(screen.getByText(/not countersigned yet/i)).toBeInTheDocument();
  });
});

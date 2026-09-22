import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proposals", () => ({
  createProposal: vi.fn(),
  updateProposal: vi.fn(),
  deleteProposal: vi.fn(),
  sendProposal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { AuthApiError } from "@/lib/auth";
import * as proposals from "@/lib/proposals";
import { redirect } from "next/navigation";

import {
  createProposalAction,
  deleteProposalAction,
  sendProposalAction,
  updateProposalAction,
} from "./actions";

const agencyId = "a1";

const input = {
  leadId: null,
  clientId: null,
  title: "Website redesign",
  recipientName: "Jamie Rivera",
  recipientEmail: "jamie@example.com",
  content: null,
  currency: "USD",
  taxRatePercent: "0",
  validUntil: null,
  lineItems: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proposals actions", () => {
  it("returns the proposal on create", async () => {
    vi.mocked(proposals.createProposal).mockResolvedValueOnce({ id: "p1" } as never);
    const result = await createProposalAction(agencyId, input);
    expect(result).toEqual({ proposal: { id: "p1" } });
    expect(proposals.createProposal).toHaveBeenCalledWith(agencyId, input);
  });

  it("returns the proposal on update", async () => {
    vi.mocked(proposals.updateProposal).mockResolvedValueOnce({ id: "p1" } as never);
    const result = await updateProposalAction(agencyId, "p1", input);
    expect(result).toEqual({ proposal: { id: "p1" } });
    expect(proposals.updateProposal).toHaveBeenCalledWith(agencyId, "p1", input);
  });

  it("maps an AuthApiError to its message on create", async () => {
    vi.mocked(proposals.createProposal).mockRejectedValueOnce(new AuthApiError("Title is required", 422));
    const result = await createProposalAction(agencyId, input);
    expect(result).toEqual({ error: "Title is required" });
  });

  it("falls back to a generic message for an unknown update error", async () => {
    vi.mocked(proposals.updateProposal).mockRejectedValueOnce(new Error("boom"));
    const result = await updateProposalAction(agencyId, "p1", input);
    expect(result).toEqual({ error: "Unable to update proposal" });
  });

  it("deletes then redirects to the list", async () => {
    vi.mocked(proposals.deleteProposal).mockResolvedValueOnce(undefined);
    await expect(deleteProposalAction(agencyId, "p1")).rejects.toThrow("NEXT_REDIRECT");
    expect(proposals.deleteProposal).toHaveBeenCalledWith(agencyId, "p1");
    expect(redirect).toHaveBeenCalledWith("/proposals");
  });

  it("returns an error instead of redirecting when delete fails", async () => {
    vi.mocked(proposals.deleteProposal).mockRejectedValueOnce(new AuthApiError("Cannot delete a sent proposal", 409));
    const result = await deleteProposalAction(agencyId, "p1");
    expect(result).toEqual({ error: "Cannot delete a sent proposal" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends the proposal with a recipient email override", async () => {
    vi.mocked(proposals.sendProposal).mockResolvedValueOnce({ id: "p1", status: "sent" } as never);
    const result = await sendProposalAction(agencyId, "p1", "new@example.com");
    expect(result).toEqual({ proposal: { id: "p1", status: "sent" } });
    expect(proposals.sendProposal).toHaveBeenCalledWith(agencyId, "p1", "new@example.com");
  });

  it("maps an AuthApiError to its message on send", async () => {
    vi.mocked(proposals.sendProposal).mockRejectedValueOnce(
      new AuthApiError("Add a recipient email before sending", 409),
    );
    const result = await sendProposalAction(agencyId, "p1", null);
    expect(result).toEqual({ error: "Add a recipient email before sending" });
  });
});

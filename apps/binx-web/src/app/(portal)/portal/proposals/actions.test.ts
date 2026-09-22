import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal", () => ({
  signPortalProposal: vi.fn(),
  declinePortalProposal: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import * as portal from "@/lib/portal";

import { declinePortalProposalAction, signPortalProposalAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("portal proposal actions", () => {
  it("signs the proposal and returns it", async () => {
    vi.mocked(portal.signPortalProposal).mockResolvedValueOnce({ status: "signed" } as never);
    const result = await signPortalProposalAction("p1");
    expect(result).toEqual({ proposal: { status: "signed" } });
    expect(portal.signPortalProposal).toHaveBeenCalledWith("p1");
  });

  it("maps an AuthApiError to its message on sign", async () => {
    vi.mocked(portal.signPortalProposal).mockRejectedValueOnce(
      new AuthApiError("This proposal has expired — ask the agency to resend it", 409),
    );
    const result = await signPortalProposalAction("p1");
    expect(result).toEqual({ error: "This proposal has expired — ask the agency to resend it" });
  });

  it("falls back to a generic message for an unknown sign error", async () => {
    vi.mocked(portal.signPortalProposal).mockRejectedValueOnce(new Error("boom"));
    const result = await signPortalProposalAction("p1");
    expect(result).toEqual({ error: "Unable to sign this proposal" });
  });

  it("declines the proposal and returns it", async () => {
    vi.mocked(portal.declinePortalProposal).mockResolvedValueOnce({ status: "declined" } as never);
    const result = await declinePortalProposalAction("p1", "Went with another agency");
    expect(result).toEqual({ proposal: { status: "declined" } });
    expect(portal.declinePortalProposal).toHaveBeenCalledWith("p1", "Went with another agency");
  });

  it("falls back to a generic message for an unknown decline error", async () => {
    vi.mocked(portal.declinePortalProposal).mockRejectedValueOnce(new Error("boom"));
    const result = await declinePortalProposalAction("p1", null);
    expect(result).toEqual({ error: "Unable to decline this proposal" });
  });
});

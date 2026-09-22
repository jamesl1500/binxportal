import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proposals", () => ({
  signPublicProposal: vi.fn(),
  declinePublicProposal: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import * as proposals from "@/lib/proposals";

import { declinePublicProposalAction, signPublicProposalAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public proposal actions", () => {
  it("signs the proposal and returns it", async () => {
    vi.mocked(proposals.signPublicProposal).mockResolvedValueOnce({ status: "signed" } as never);
    const result = await signPublicProposalAction("tok", "Jamie Rivera", "jamie@example.com");
    expect(result).toEqual({ proposal: { status: "signed" } });
    expect(proposals.signPublicProposal).toHaveBeenCalledWith("tok", "Jamie Rivera", "jamie@example.com");
  });

  it("maps an AuthApiError to its message on sign", async () => {
    vi.mocked(proposals.signPublicProposal).mockRejectedValueOnce(
      new AuthApiError("This proposal has expired — ask the agency to resend it", 409),
    );
    const result = await signPublicProposalAction("tok", "Jamie Rivera", "jamie@example.com");
    expect(result).toEqual({ error: "This proposal has expired — ask the agency to resend it" });
  });

  it("declines the proposal and returns it", async () => {
    vi.mocked(proposals.declinePublicProposal).mockResolvedValueOnce({ status: "declined" } as never);
    const result = await declinePublicProposalAction("tok", "Went with another agency");
    expect(result).toEqual({ proposal: { status: "declined" } });
    expect(proposals.declinePublicProposal).toHaveBeenCalledWith("tok", "Went with another agency");
  });

  it("falls back to a generic message for an unknown decline error", async () => {
    vi.mocked(proposals.declinePublicProposal).mockRejectedValueOnce(new Error("boom"));
    const result = await declinePublicProposalAction("tok", null);
    expect(result).toEqual({ error: "Unable to decline this proposal" });
  });
});

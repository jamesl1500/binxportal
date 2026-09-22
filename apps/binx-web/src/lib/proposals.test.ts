import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import * as proposals from "@/lib/proposals";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

const A = "agency-1";
const P = "proposal-1";
const TOKEN = "share-token-1";
const AUTH = { headers: { Authorization: "Bearer tok" } };

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`status ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("tok");
});

const proposalInput: proposals.ProposalInput = {
  leadId: null,
  clientId: null,
  title: "Website redesign",
  recipientName: "Jane Prospect",
  recipientEmail: "jane@example.com",
  content: "Scope of work",
  currency: "USD",
  taxRatePercent: "0",
  validUntil: null,
  lineItems: [{ description: "Design", quantity: "1", unitPriceCents: 200_000 }],
};

describe("proposals.ts", () => {
  it("getProposals passes the filter through as query params", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await proposals.getProposals(A, { leadId: "l1", clientId: "c1", status: "sent" });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/proposals`, {
      ...AUTH,
      params: { lead_id: "l1", client_id: "c1", status: "sent" },
    });
  });

  it("getProposals defaults to an empty filter", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: [] });
    await proposals.getProposals(A);
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/proposals`, {
      ...AUTH,
      params: { lead_id: undefined, client_id: undefined, status: undefined },
    });
  });

  it("getProposal fetches one proposal's detail", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { id: P } });
    expect(await proposals.getProposal(A, P)).toEqual({ id: P });
    expect(mockedApi.get).toHaveBeenCalledWith(`/agencies/${A}/proposals/${P}`, AUTH);
  });

  it("createProposal POSTs a mapped line-item payload", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: P } });
    await proposals.createProposal(A, proposalInput);
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/proposals`,
      expect.objectContaining({
        title: "Website redesign",
        recipient_email: "jane@example.com",
        line_items: [{ description: "Design", quantity: "1", unit_price_cents: 200_000 }],
      }),
      AUTH,
    );
  });

  it("updateProposal PATCHes the draft", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: { id: P } });
    await proposals.updateProposal(A, P, proposalInput);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      `/agencies/${A}/proposals/${P}`,
      expect.objectContaining({ title: "Website redesign" }),
      AUTH,
    );
  });

  it("deleteProposal DELETEs the draft", async () => {
    mockedApi.delete.mockResolvedValueOnce({});
    await proposals.deleteProposal(A, P);
    expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/proposals/${P}`, AUTH);
  });

  it("sendProposal POSTs the recipient email override", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: P, status: "sent" } });
    await proposals.sendProposal(A, P, "jane@example.com");
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/proposals/${P}/send`,
      { recipient_email: "jane@example.com" },
      AUTH,
    );
  });

  describe("public (unauthenticated) endpoints", () => {
    it("getPublicProposal GETs without an auth header", async () => {
      mockedApi.get.mockResolvedValueOnce({ data: { status: "sent" } });
      const res = await proposals.getPublicProposal(TOKEN);
      expect(res).toEqual({ status: "sent" });
      expect(mockedApi.get).toHaveBeenCalledWith(`/proposals/public/${TOKEN}`);
      expect(mockedGetAccessToken).not.toHaveBeenCalled();
    });

    it("getPublicProposal maps an error to a friendly fallback message", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(404, null));
      await expect(proposals.getPublicProposal(TOKEN)).rejects.toMatchObject({
        name: "AuthApiError",
        status: 404,
        message: "This proposal link is invalid or has expired",
      });
    });

    it("signPublicProposal POSTs the signer's name and email", async () => {
      mockedApi.post.mockResolvedValueOnce({ data: { status: "signed" } });
      await proposals.signPublicProposal(TOKEN, "Jane Prospect", "jane@example.com");
      expect(mockedApi.post).toHaveBeenCalledWith(`/proposals/public/${TOKEN}/sign`, {
        signer_name: "Jane Prospect",
        signer_email: "jane@example.com",
      });
    });

    it("declinePublicProposal POSTs the reason", async () => {
      mockedApi.post.mockResolvedValueOnce({ data: { status: "declined" } });
      await proposals.declinePublicProposal(TOKEN, "Budget");
      expect(mockedApi.post).toHaveBeenCalledWith(`/proposals/public/${TOKEN}/decline`, { reason: "Budget" });
    });
  });

  describe("proposalStatusLabel", () => {
    it.each([
      ["draft", "Draft"],
      ["sent", "Sent"],
      ["viewed", "Viewed"],
      ["signed", "Signed"],
      ["declined", "Declined"],
      ["expired", "Expired"],
    ])("labels %s as %s", (status, label) => {
      expect(proposals.proposalStatusLabel(status)).toBe(label);
    });

    it("falls back to the raw value for an unknown status", () => {
      expect(proposals.proposalStatusLabel("mystery")).toBe("mystery");
    });
  });

  describe("error handling (authenticated endpoints)", () => {
    it("wraps upstream errors as AuthApiError", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(403, "Nope"));
      await expect(proposals.getProposals(A)).rejects.toMatchObject({ name: "AuthApiError", status: 403, message: "Nope" });
    });

    it.each([
      ["getProposals", () => proposals.getProposals(A)],
      ["getProposal", () => proposals.getProposal(A, P)],
      ["createProposal", () => proposals.createProposal(A, proposalInput)],
      ["updateProposal", () => proposals.updateProposal(A, P, proposalInput)],
      ["deleteProposal", () => proposals.deleteProposal(A, P)],
      ["sendProposal", () => proposals.sendProposal(A, P, null)],
    ])("%s throws AuthApiError(401) when unauthenticated", async (_name, call) => {
      mockedGetAccessToken.mockResolvedValueOnce(undefined);
      await expect(call()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    });
  });
});

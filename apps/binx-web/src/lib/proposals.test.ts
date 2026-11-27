import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/proposal-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/proposal-access")>();
  return { ...actual, proposalAccessHeaders: vi.fn() };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { ProposalCodeRequired, proposalAccessHeaders } from "@/lib/proposal-access";
import * as proposals from "@/lib/proposals";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);
const mockedAccessHeaders = vi.mocked(proposalAccessHeaders);
const NO_ACCESS = { headers: {} };

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
  mockedAccessHeaders.mockResolvedValue({});
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
        line_items: [
          {
            description: "Design",
            details: null,
            quantity: "1",
            unit_price_cents: 200_000,
            service_id: null,
            billing: "one_time",
            package_key: null,
            optional: false,
            selected: true,
          },
        ],
        packages: [],
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
      expect(mockedApi.get).toHaveBeenCalledWith(`/proposals/public/${TOKEN}`, NO_ACCESS);
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

    it("signPublicProposal POSTs the signer, their consent and the fingerprint they saw", async () => {
      mockedApi.post.mockResolvedValueOnce({ data: { status: "signed" } });
      await proposals.signPublicProposal(TOKEN, "Jane Prospect", "jane@example.com", true, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(mockedApi.post).toHaveBeenCalledWith(`/proposals/public/${TOKEN}/sign`, {
        signer_name: "Jane Prospect",
        signer_email: "jane@example.com",
        consent: true,
        document_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }, NO_ACCESS);
    });

    it("getPublicCertificate reads by token", async () => {
      mockedApi.get.mockResolvedValueOnce({ data: { document_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } });
      await expect(proposals.getPublicCertificate(TOKEN)).resolves.toEqual({ document_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
      expect(mockedApi.get).toHaveBeenCalledWith(`/proposals/public/${TOKEN}/certificate`, NO_ACCESS);
    });

    it("declinePublicProposal POSTs the reason", async () => {
      mockedApi.post.mockResolvedValueOnce({ data: { status: "declined" } });
      await proposals.declinePublicProposal(TOKEN, "Budget");
      expect(mockedApi.post).toHaveBeenCalledWith(`/proposals/public/${TOKEN}/decline`, { reason: "Budget" }, NO_ACCESS);
    });

    it("sends the email-code access the visitor holds for this link", async () => {
      mockedAccessHeaders.mockResolvedValueOnce({ "X-Proposal-Access": "jwt" });
      mockedApi.get.mockResolvedValueOnce({ data: { status: "viewed" } });
      await proposals.getPublicProposal(TOKEN);
      expect(mockedAccessHeaders).toHaveBeenCalledWith(TOKEN);
      expect(mockedApi.get).toHaveBeenCalledWith(`/proposals/public/${TOKEN}`, {
        headers: { "X-Proposal-Access": "jwt" },
      });
    });

    it("turns the email-code 403 into ProposalCodeRequired with what the code page shows", async () => {
      mockedApi.get.mockRejectedValueOnce(
        Object.assign(new Error("status 403"), {
          isAxiosError: true,
          response: {
            status: 403,
            data: {
              detail: "Enter the code we emailed to open this proposal.",
              code: "email_code_required",
              details: { agency_name: "Northlight", title: "Brand refresh", email_hint: "j•••@fjord.example" },
            },
          },
        }),
      );
      const error = await proposals.getPublicProposal(TOKEN).catch((caught) => caught);
      expect(error).toBeInstanceOf(ProposalCodeRequired);
      expect(error).toMatchObject({ agencyName: "Northlight", title: "Brand refresh", emailHint: "j•••@fjord.example" });
    });

    it("starts and confirms the deposit payment through the share link", async () => {
      mockedAccessHeaders.mockResolvedValue({ "X-Proposal-Access": "jwt" });
      const ACCESS = { headers: { "X-Proposal-Access": "jwt" } };
      mockedApi.post.mockResolvedValueOnce({ data: { checkout_url: "https://checkout.stripe.test/s" } });
      await expect(proposals.startPublicDepositCheckout(TOKEN)).resolves.toEqual({
        checkout_url: "https://checkout.stripe.test/s",
      });
      expect(mockedApi.post).toHaveBeenCalledWith(`/proposals/public/${TOKEN}/deposit/checkout`, undefined, ACCESS);

      mockedApi.post.mockResolvedValueOnce({ data: { outcome: "paid", proposal: { status: "signed" } } });
      await expect(proposals.confirmPublicDeposit(TOKEN, "cs_1")).resolves.toMatchObject({ outcome: "paid" });
      expect(mockedApi.post).toHaveBeenLastCalledWith(
        `/proposals/public/${TOKEN}/deposit/confirm`,
        { session_id: "cs_1" },
        ACCESS,
      );

      mockedApi.post.mockRejectedValueOnce(axiosError(409, "The deposit is already paid"));
      await expect(proposals.startPublicDepositCheckout(TOKEN)).rejects.toMatchObject({
        name: "AuthApiError",
        status: 409,
        message: "The deposit is already paid",
      });
    });

    it("asks for a code and trades one for access", async () => {
      mockedApi.post.mockResolvedValueOnce({ data: { email_hint: "j•••@fjord.example" } });
      await expect(proposals.requestPublicProposalCode(TOKEN)).resolves.toEqual({ email_hint: "j•••@fjord.example" });
      expect(mockedApi.post).toHaveBeenCalledWith(`/proposals/public/${TOKEN}/code`);

      mockedApi.post.mockResolvedValueOnce({ data: { access_token: "jwt", expires_in_seconds: 60 } });
      await proposals.verifyPublicProposalCode(TOKEN, "123456");
      expect(mockedApi.post).toHaveBeenLastCalledWith(`/proposals/public/${TOKEN}/code/verify`, { code: "123456" });

      mockedApi.post.mockRejectedValueOnce(axiosError(422, "That code isn't right."));
      await expect(proposals.verifyPublicProposalCode(TOKEN, "000000")).rejects.toMatchObject({
        name: "AuthApiError",
        status: 422,
        message: "That code isn't right.",
      });
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

  describe("attachments", () => {
    it("uploads as multipart, letting axios set the boundary", async () => {
      mockedApi.post.mockResolvedValueOnce({ data: { id: "att-1" } });
      const file = new File(["%PDF"], "contract.pdf");
      await expect(proposals.uploadProposalAttachment(A, P, file)).resolves.toEqual({ id: "att-1" });
      const [url, body, config] = mockedApi.post.mock.calls[0];
      expect(url).toBe(`/agencies/${A}/proposals/${P}/attachments`);
      expect((body as FormData).get("file")).toBeInstanceOf(File);
      expect(config).toEqual({ headers: { Authorization: "Bearer tok", "Content-Type": undefined } });
    });

    it("maps an upload error to AuthApiError", async () => {
      mockedApi.post.mockRejectedValueOnce(axiosError(413, "Files must be 25MB or smaller"));
      await expect(proposals.uploadProposalAttachment(A, P, new File(["x"], "x"))).rejects.toMatchObject({
        message: "Files must be 25MB or smaller",
        status: 413,
      });
    });

    it("deletes", async () => {
      mockedApi.delete.mockResolvedValueOnce({});
      await proposals.deleteProposalAttachment(A, P, "att-1");
      expect(mockedApi.delete).toHaveBeenCalledWith(`/agencies/${A}/proposals/${P}/attachments/att-1`, AUTH);
    });
  });

  describe("signing record", () => {
    it("reads the audit trail and the certificate", async () => {
      mockedApi.get.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: { title: "T" } });
      await expect(proposals.getProposalEvents(A, P)).resolves.toEqual([]);
      await expect(proposals.getProposalCertificate(A, P)).resolves.toEqual({ title: "T" });
      expect(mockedApi.get).toHaveBeenNthCalledWith(1, `/agencies/${A}/proposals/${P}/events`, AUTH);
      expect(mockedApi.get).toHaveBeenNthCalledWith(2, `/agencies/${A}/proposals/${P}/certificate`, AUTH);
    });

    it("maps a not-yet-signed certificate to AuthApiError 409", async () => {
      mockedApi.get.mockRejectedValueOnce(axiosError(409, "This proposal hasn't been signed yet"));
      await expect(proposals.getProposalCertificate(A, P)).rejects.toMatchObject({ status: 409 });
    });
  });

  it("countersignProposal POSTs consent and the fingerprint", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { id: P } });
    await proposals.countersignProposal(A, P, true, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(mockedApi.post).toHaveBeenCalledWith(
      `/agencies/${A}/proposals/${P}/countersign`,
      { consent: true, document_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      AUTH,
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import {
  codeRequiredFrom,
  ProposalCodeRequired,
  proposalAccessCookieName,
  proposalAccessHeaders,
  rememberProposalAccess,
} from "@/lib/proposal-access";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proposal-access", () => {
  it("names the cookie after a hash of the share token, never the token", () => {
    const name = proposalAccessCookieName("share-token-1");
    expect(name).toMatch(/^binx_pa_[0-9a-f]{16}$/);
    expect(name).not.toContain("share-token-1");
    expect(proposalAccessCookieName("share-token-2")).not.toBe(name);
  });

  it("sends the header only when the visitor holds access", async () => {
    jar.get.mockReturnValueOnce(undefined);
    await expect(proposalAccessHeaders("tok")).resolves.toEqual({});
    jar.get.mockReturnValueOnce({ value: "jwt" });
    await expect(proposalAccessHeaders("tok")).resolves.toEqual({ "X-Proposal-Access": "jwt" });
    expect(jar.get).toHaveBeenCalledWith(proposalAccessCookieName("tok"));
  });

  it("keeps access in an httpOnly cookie for as long as it lasts", async () => {
    await rememberProposalAccess("tok", "jwt", 3600);
    expect(jar.set).toHaveBeenCalledWith(
      proposalAccessCookieName("tok"),
      "jwt",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 3600 }),
    );
  });

  it("recognises only binx-api's email_code_required 403", () => {
    const error = (status: number, data: unknown) =>
      Object.assign(new Error("x"), { isAxiosError: true, response: { status, data } });

    const gate = codeRequiredFrom(
      error(403, { code: "email_code_required", details: { agency_name: "Northlight", title: "Brand refresh" } }),
    );
    expect(gate).toBeInstanceOf(ProposalCodeRequired);
    expect(gate).toMatchObject({ agencyName: "Northlight", title: "Brand refresh", emailHint: "the recipient" });
    expect(codeRequiredFrom(error(403, { code: "forbidden" }))).toBeNull();
    expect(codeRequiredFrom(error(404, { code: "email_code_required" }))).toBeNull();
    expect(codeRequiredFrom(new Error("boom"))).toBeNull();
  });
});

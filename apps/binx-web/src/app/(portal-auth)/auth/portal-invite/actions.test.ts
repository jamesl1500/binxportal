import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal", () => ({ acceptPortalInvitation: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  logout: vi.fn(async () => undefined),
}));
// Next's redirect() throws internally; mimic that with a sentinel.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { redirect } from "next/navigation";

import { AuthApiError, logout } from "@/lib/auth";
import { acceptPortalInvitation } from "@/lib/portal";

import { acceptPortalInviteAction, signOutForPortalInviteAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acceptPortalInviteAction", () => {
  it("redirects into the portal once accepted", async () => {
    vi.mocked(acceptPortalInvitation).mockResolvedValueOnce(undefined as never);
    await expect(acceptPortalInviteAction("tok")).rejects.toThrow("REDIRECT:/portal");
  });

  it("surfaces binx-api's message, e.g. an email mismatch", async () => {
    vi.mocked(acceptPortalInvitation).mockRejectedValueOnce(
      new AuthApiError("This invitation was sent to a different email address", 403),
    );
    await expect(acceptPortalInviteAction("tok")).resolves.toEqual({
      error: "This invitation was sent to a different email address",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for unexpected errors", async () => {
    vi.mocked(acceptPortalInvitation).mockRejectedValueOnce(new Error("boom"));
    await expect(acceptPortalInviteAction("tok")).resolves.toEqual({
      error: "Unable to accept this invitation",
    });
  });
});

describe("signOutForPortalInviteAction", () => {
  it("signs out first, then returns to the same invitation with the token encoded", async () => {
    await expect(signOutForPortalInviteAction("tok/en+1")).rejects.toThrow(
      "REDIRECT:/auth/portal-invite?token=tok%2Fen%2B1",
    );
    expect(logout).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logout).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(redirect).mock.invocationCallOrder[0],
    );
  });
});

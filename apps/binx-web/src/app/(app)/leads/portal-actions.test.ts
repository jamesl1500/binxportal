import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/lead-portal", () => ({
  enableLeadPortal: vi.fn(),
  disableLeadPortal: vi.fn(),
  resetLeadPortalLink: vi.fn(),
  replyInLeadPortal: vi.fn(),
}));

import { refresh } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { enableLeadPortal, replyInLeadPortal, resetLeadPortalLink } from "@/lib/lead-portal";

import {
  enableLeadPortalAction,
  replyInLeadPortalAction,
  resetLeadPortalLinkAction,
} from "./portal-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lead portal actions", () => {
  it("turns it on and refreshes", async () => {
    vi.mocked(enableLeadPortal).mockResolvedValueOnce({} as never);
    await expect(enableLeadPortalAction("a1", "l1", "Hi")).resolves.toEqual({});
    expect(enableLeadPortal).toHaveBeenCalledWith("a1", "l1", "Hi");
    expect(refresh).toHaveBeenCalled();
  });

  it("flags a plan that doesn't include it", async () => {
    vi.mocked(enableLeadPortal).mockRejectedValueOnce(new AuthApiError("Lead portals are on Starter", 402));
    await expect(enableLeadPortalAction("a1", "l1", null)).resolves.toEqual({
      error: "Lead portals are on Starter",
      needsUpgrade: true,
    });
  });

  it("won't send an empty reply", async () => {
    await expect(replyInLeadPortalAction("a1", "l1", "   ")).resolves.toEqual({ error: "Write a reply first" });
    expect(replyInLeadPortal).not.toHaveBeenCalled();
  });

  it("resets the link", async () => {
    vi.mocked(resetLeadPortalLink).mockResolvedValueOnce({} as never);
    await expect(resetLeadPortalLinkAction("a1", "l1")).resolves.toEqual({});
  });
});

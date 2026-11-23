import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/agencies", () => ({
  getMyAgencies: vi.fn(),
  setCurrentAgencyId: vi.fn(),
}));

import { getMyAgencies, setCurrentAgencyId } from "@/lib/agencies";

import { GET } from "./route";

const agencies = vi.mocked(getMyAgencies);
const select = vi.mocked(setCurrentAgencyId);

const request = (query: string) =>
  new NextRequest(`https://binx.test/api/stripe/connect/return?${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  agencies.mockResolvedValue([{ id: "a1" }, { id: "a2" }] as never);
});

describe("Stripe Connect return", () => {
  it("re-selects the agency the account belongs to", async () => {
    await expect(GET(request("agency=a2&stripe=return&to=settings"))).rejects.toThrow(
      "REDIRECT:/settings/invoicing?stripe=return",
    );
    expect(select).toHaveBeenCalledWith("a2");
  });

  it.each([
    ["onboarding", "/onboarding/five"],
    ["new_agency", "/agencies/new/payments"],
  ])("returns to the %s flow", async (to, path) => {
    await expect(GET(request(`agency=a1&stripe=refresh&to=${to}`))).rejects.toThrow(
      `REDIRECT:${path}?stripe=refresh`,
    );
  });

  it("won't select an agency the person isn't in", async () => {
    await expect(GET(request("agency=other&stripe=return"))).rejects.toThrow(
      "REDIRECT:/settings/invoicing?stripe=return",
    );
    expect(select).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example", "//evil.example", "constructor", "__proto__"])(
    "ignores an unknown destination (%s)",
    async (to) => {
      await expect(
        GET(request(`agency=a1&stripe=return&to=${encodeURIComponent(to)}`)),
      ).rejects.toThrow("REDIRECT:/settings/invoicing?stripe=return");
    },
  );

  it("still redirects when the session can't be read", async () => {
    agencies.mockRejectedValueOnce(new Error("signed out"));
    await expect(GET(request("agency=a1&stripe=return"))).rejects.toThrow(
      "REDIRECT:/settings/invoicing?stripe=return",
    );
    expect(select).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agencies", () => ({
  acceptAgencyInvitation: vi.fn(),
  setCurrentAgencyId: vi.fn(async () => undefined),
}));

// Next's real redirect() throws a special "NEXT_REDIRECT" error internally
// that the framework catches further up to actually perform the navigation.
// We mimic that "redirect = throw" behavior with our own sentinel error so we
// can assert on `.rejects.toThrow(...)` instead of needing a full Next runtime.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { acceptAgencyInvitation, setCurrentAgencyId } from "@/lib/agencies";
import { acceptInviteAction } from "./actions";

const mockedAcceptAgencyInvitation = vi.mocked(acceptAgencyInvitation);
const mockedSetCurrentAgencyId = vi.mocked(setCurrentAgencyId);
const mockedRedirect = vi.mocked(redirect);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acceptInviteAction", () => {
  it("sets the joined agency as current and redirects to the dashboard on success", async () => {
    mockedAcceptAgencyInvitation.mockResolvedValueOnce({
      id: "agency-1",
      name: "Acme Agency",
      slug: "acme-agency",
      role: "member",
    });

    await expect(acceptInviteAction("raw-token")).rejects.toThrow("REDIRECT:/dashboard");

    expect(mockedAcceptAgencyInvitation).toHaveBeenCalledWith("raw-token");
    expect(mockedSetCurrentAgencyId).toHaveBeenCalledWith("agency-1");
    expect(mockedRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns the upstream error without setting a current agency or redirecting", async () => {
    mockedAcceptAgencyInvitation.mockRejectedValueOnce(
      new AuthApiError("This invitation was sent to a different email address", 403),
    );

    await expect(acceptInviteAction("raw-token")).resolves.toEqual({
      error: "This invitation was sent to a different email address",
    });
    expect(mockedSetCurrentAgencyId).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedAcceptAgencyInvitation.mockRejectedValueOnce(new Error("network down"));

    await expect(acceptInviteAction("raw-token")).resolves.toEqual({ error: "Unable to accept invitation" });
  });
});

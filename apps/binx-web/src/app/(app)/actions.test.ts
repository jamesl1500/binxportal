import { beforeEach, describe, expect, it, vi } from "vitest";

// logoutAction() only orchestrates: clear the session cookies, redirect to
// login. Mocked alongside the real AuthApiError (via importOriginal) since
// createAgencyAction's error path is asserted against actual instances of it.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, logout: vi.fn(async () => undefined) };
});

// switchAgencyAction() only orchestrates: re-check membership via
// getMyAgencies, then persist the choice via setCurrentAgencyId.
// createAgencyAction() only orchestrates: call createAgency, then persist the
// result via setCurrentAgencyId. We mock all three so these tests prove the
// ORCHESTRATION (and switchAgencyAction's membership guard) is correct,
// without a real network call.
vi.mock("@/lib/agencies", () => ({
  getMyAgencies: vi.fn(),
  setCurrentAgencyId: vi.fn(async () => undefined),
  createAgency: vi.fn(),
}));

// updateTutorialProgressAction() only orchestrates: call updateTutorialProgress.
vi.mock("@/lib/users", () => ({
  updateTutorialProgress: vi.fn(),
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

import { AuthApiError, logout } from "@/lib/auth";
import { createAgency, getMyAgencies, setCurrentAgencyId } from "@/lib/agencies";
import { updateTutorialProgress } from "@/lib/users";
import { createAgencyAction, logoutAction, switchAgencyAction, updateTutorialProgressAction } from "./actions";

const mockedLogout = vi.mocked(logout);
const mockedRedirect = vi.mocked(redirect);
const mockedGetMyAgencies = vi.mocked(getMyAgencies);
const mockedSetCurrentAgencyId = vi.mocked(setCurrentAgencyId);
const mockedCreateAgency = vi.mocked(createAgency);
const mockedUpdateTutorialProgress = vi.mocked(updateTutorialProgress);

const agencies = [
  { id: "aaaaaaaa-1111-1111-1111-111111111111", name: "Acme Agency", slug: "acme-agency", role: "owner" as const, has_logo: false },
  { id: "bbbbbbbb-2222-2222-2222-222222222222", name: "Widgets Co", slug: "widgets-co", role: "member" as const, has_logo: false },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("logoutAction", () => {
  it("clears the session and redirects to /auth/login", async () => {
    await expect(logoutAction()).rejects.toThrow("REDIRECT:/auth/login");

    expect(mockedLogout).toHaveBeenCalledOnce();
    expect(mockedRedirect).toHaveBeenCalledWith("/auth/login");
  });
});

describe("switchAgencyAction", () => {
  it("persists the agency when the user is a member of it", async () => {
    mockedGetMyAgencies.mockResolvedValueOnce(agencies);

    await expect(switchAgencyAction(agencies[1].id)).resolves.toEqual({});

    expect(mockedSetCurrentAgencyId).toHaveBeenCalledWith(agencies[1].id);
  });

  // Guards against a stale client offering an agency the user has since left,
  // or a tampered call — the switcher only ever offers real memberships, but
  // this is the actual authorization check.
  it("rejects an agency the user is not a member of, without persisting it", async () => {
    mockedGetMyAgencies.mockResolvedValueOnce(agencies);

    await expect(switchAgencyAction("some-other-agency-id")).resolves.toEqual({
      error: "You're not a member of that organization",
    });
    expect(mockedSetCurrentAgencyId).not.toHaveBeenCalled();
  });
});

describe("createAgencyAction", () => {
  it("creates the agency and makes it current on success", async () => {
    mockedCreateAgency.mockResolvedValueOnce(agencies[1]);

    await expect(createAgencyAction("Widgets Co")).resolves.toEqual({ agency: agencies[1] });

    expect(mockedCreateAgency).toHaveBeenCalledWith("Widgets Co");
    expect(mockedSetCurrentAgencyId).toHaveBeenCalledWith(agencies[1].id);
  });

  it("returns the upstream error message without switching agencies", async () => {
    mockedCreateAgency.mockRejectedValueOnce(new AuthApiError("Agency name is required", 422));

    await expect(createAgencyAction("")).resolves.toEqual({ error: "Agency name is required" });
    expect(mockedSetCurrentAgencyId).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedCreateAgency.mockRejectedValueOnce(new Error("network down"));

    await expect(createAgencyAction("Widgets Co")).resolves.toEqual({ error: "Unable to create your agency" });
  });
});

describe("updateTutorialProgressAction", () => {
  const progress = { tour_completed: true, dismissed_popups: ["clients-new"] };

  it("saves the progress and resolves with no error", async () => {
    mockedUpdateTutorialProgress.mockResolvedValueOnce(progress);

    await expect(updateTutorialProgressAction(progress)).resolves.toEqual({});
    expect(mockedUpdateTutorialProgress).toHaveBeenCalledWith(progress);
  });

  it("maps an AuthApiError to a returned error", async () => {
    mockedUpdateTutorialProgress.mockRejectedValueOnce(new AuthApiError("Not authenticated", 401));

    await expect(updateTutorialProgressAction(progress)).resolves.toEqual({ error: "Not authenticated" });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedUpdateTutorialProgress.mockRejectedValueOnce(new Error("network down"));

    await expect(updateTutorialProgressAction(progress)).resolves.toEqual({
      error: "Unable to save tutorial progress",
    });
  });
});

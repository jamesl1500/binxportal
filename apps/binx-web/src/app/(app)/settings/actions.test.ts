import { beforeEach, describe, expect, it, vi } from "vitest";

// Both actions only orchestrate: call the matching lib/agencies function,
// translate a thrown AuthApiError into a returned { error }. We mock the lib
// calls so this test proves the ORCHESTRATION is correct, without a real
// network call.
vi.mock("@/lib/agencies", () => ({
  updateAgency: vi.fn(),
  deleteAgency: vi.fn(),
  clearCurrentAgencyId: vi.fn(async () => undefined),
  updateAgencyProfile: vi.fn(),
  uploadAgencyImage: vi.fn(),
  deleteAgencyImage: vi.fn(),
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
import {
  clearCurrentAgencyId,
  deleteAgency,
  deleteAgencyImage,
  updateAgency,
  updateAgencyProfile,
  uploadAgencyImage,
} from "@/lib/agencies";
import {
  deleteAgencyAction,
  removeAgencyImageAction,
  updateAgencyAction,
  updateAgencyProfileAction,
  uploadAgencyImageAction,
} from "./actions";

const mockedUpdateAgency = vi.mocked(updateAgency);
const mockedDeleteAgency = vi.mocked(deleteAgency);
const mockedClearCurrentAgencyId = vi.mocked(clearCurrentAgencyId);
const mockedRedirect = vi.mocked(redirect);
const mockedUpdateProfile = vi.mocked(updateAgencyProfile);
const mockedUploadImage = vi.mocked(uploadAgencyImage);
const mockedDeleteImage = vi.mocked(deleteAgencyImage);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateAgencyAction", () => {
  it("renames the agency and returns no error on success", async () => {
    mockedUpdateAgency.mockResolvedValueOnce({
      id: agencyId,
      name: "New Name",
      slug: "acme-agency",
      role: "owner",
    });

    await expect(updateAgencyAction(agencyId, "New Name")).resolves.toEqual({});
    expect(mockedUpdateAgency).toHaveBeenCalledWith(agencyId, "New Name");
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdateAgency.mockRejectedValueOnce(new AuthApiError("Insufficient permissions for this agency", 403));

    await expect(updateAgencyAction(agencyId, "New Name")).resolves.toEqual({
      error: "Insufficient permissions for this agency",
    });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedUpdateAgency.mockRejectedValueOnce(new Error("network down"));

    await expect(updateAgencyAction(agencyId, "New Name")).resolves.toEqual({
      error: "Unable to update agency",
    });
  });
});

describe("deleteAgencyAction", () => {
  it("clears the current-agency cookie and redirects to /dashboard on success", async () => {
    mockedDeleteAgency.mockResolvedValueOnce(undefined);

    await expect(deleteAgencyAction(agencyId)).rejects.toThrow("REDIRECT:/dashboard");

    expect(mockedDeleteAgency).toHaveBeenCalledWith(agencyId);
    expect(mockedClearCurrentAgencyId).toHaveBeenCalledOnce();
    expect(mockedRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns the upstream error message without clearing the cookie or redirecting", async () => {
    mockedDeleteAgency.mockRejectedValueOnce(new AuthApiError("Insufficient permissions for this agency", 403));

    await expect(deleteAgencyAction(agencyId)).resolves.toEqual({
      error: "Insufficient permissions for this agency",
    });
    expect(mockedClearCurrentAgencyId).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedDeleteAgency.mockRejectedValueOnce(new Error("network down"));

    await expect(deleteAgencyAction(agencyId)).resolves.toEqual({ error: "Unable to delete agency" });
  });
});

describe("profile actions", () => {
  it("returns the updated profile on success", async () => {
    mockedUpdateProfile.mockResolvedValueOnce({ agency_id: agencyId, tagline: "Hi" } as never);
    const result = await updateAgencyProfileAction(agencyId, { tagline: "Hi" });
    expect(result).toEqual({ profile: { agency_id: agencyId, tagline: "Hi" } });
    expect(mockedUpdateProfile).toHaveBeenCalledWith(agencyId, { tagline: "Hi" });
  });

  it("maps an AuthApiError from a profile update", async () => {
    mockedUpdateProfile.mockRejectedValueOnce(new AuthApiError("Insufficient permissions for this agency", 403));
    await expect(updateAgencyProfileAction(agencyId, { tagline: "x" })).resolves.toEqual({
      error: "Insufficient permissions for this agency",
    });
  });

  it("rejects an empty file before hitting the API", async () => {
    const form = new FormData();
    form.append("file", new File([], "empty.png"));
    const result = await uploadAgencyImageAction(agencyId, "logo", form);
    expect(result).toEqual({ error: "No file selected" });
    expect(mockedUploadImage).not.toHaveBeenCalled();
  });

  it("uploads a real file and returns the profile", async () => {
    mockedUploadImage.mockResolvedValueOnce({ agency_id: agencyId, has_logo: true } as never);
    const form = new FormData();
    form.append("file", new File(["data"], "logo.png", { type: "image/png" }));
    const result = await uploadAgencyImageAction(agencyId, "logo", form);
    expect(result).toEqual({ profile: { agency_id: agencyId, has_logo: true } });
    expect(mockedUploadImage).toHaveBeenCalledWith(agencyId, "logo", expect.any(File));
  });

  it("clears an image", async () => {
    mockedDeleteImage.mockResolvedValueOnce({ agency_id: agencyId, has_logo: false } as never);
    const result = await removeAgencyImageAction(agencyId, "logo");
    expect(result).toEqual({ profile: { agency_id: agencyId, has_logo: false } });
  });
});

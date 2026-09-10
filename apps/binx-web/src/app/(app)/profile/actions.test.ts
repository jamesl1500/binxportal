import { beforeEach, describe, expect, it, vi } from "vitest";

// updateProfileAction() only orchestrates: call updateCurrentUserProfile,
// translate a thrown AuthApiError into a returned { error }. We mock the
// lib call so this test proves the ORCHESTRATION is correct, without a real
// network call.
vi.mock("@/lib/users", () => ({
  updateCurrentUserProfile: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import { updateCurrentUserProfile } from "@/lib/users";
import { updateProfileAction } from "./actions";

const mockedUpdateCurrentUserProfile = vi.mocked(updateCurrentUserProfile);

const input = {
  fullName: "Jane Doe",
  jobTitle: "Producer",
  phoneNumber: "555-0100",
  summary: "Loves spreadsheets.",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateProfileAction", () => {
  it("saves the profile and returns no error on success", async () => {
    mockedUpdateCurrentUserProfile.mockResolvedValueOnce({ id: "1" } as never);

    await expect(updateProfileAction(input)).resolves.toEqual({});
    expect(mockedUpdateCurrentUserProfile).toHaveBeenCalledWith(input);
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdateCurrentUserProfile.mockRejectedValueOnce(new AuthApiError("Full name is required", 422));

    await expect(updateProfileAction(input)).resolves.toEqual({ error: "Full name is required" });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedUpdateCurrentUserProfile.mockRejectedValueOnce(new Error("network down"));

    await expect(updateProfileAction(input)).resolves.toEqual({ error: "Unable to save your profile" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// updateProfileAction() only orchestrates: call updateCurrentUserProfile,
// translate a thrown AuthApiError into a returned { error }. We mock the
// lib call so this test proves the ORCHESTRATION is correct, without a real
// network call.
vi.mock("@/lib/users", () => ({
  updateCurrentUserProfile: vi.fn(),
  updateQualifications: vi.fn(),
  uploadUserImage: vi.fn(),
  removeUserImage: vi.fn(),
  updateAppearanceSettings: vi.fn(),
}));

import { AuthApiError } from "@/lib/auth";
import {
  removeUserImage,
  updateAppearanceSettings,
  updateCurrentUserProfile,
  updateQualifications,
  uploadUserImage,
} from "@/lib/users";
import {
  removeUserImageAction,
  updateAppearanceAction,
  updateProfileAction,
  updateQualificationsAction,
  uploadUserImageAction,
} from "./actions";

const mockedUpdateCurrentUserProfile = vi.mocked(updateCurrentUserProfile);
const mockedUpdateQualifications = vi.mocked(updateQualifications);
const mockedUploadUserImage = vi.mocked(uploadUserImage);
const mockedRemoveUserImage = vi.mocked(removeUserImage);
const mockedUpdateAppearanceSettings = vi.mocked(updateAppearanceSettings);

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

describe("updateQualificationsAction", () => {
  const qualificationsInput = { skills: ["Python"], experience: [], education: [] };

  it("saves the qualifications and returns the updated profile on success", async () => {
    const profile = { skills: ["Python"] } as never;
    mockedUpdateQualifications.mockResolvedValueOnce(profile);

    await expect(updateQualificationsAction(qualificationsInput)).resolves.toEqual({ profile });
    expect(mockedUpdateQualifications).toHaveBeenCalledWith(qualificationsInput);
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdateQualifications.mockRejectedValueOnce(new AuthApiError("Too many skills", 422));

    await expect(updateQualificationsAction(qualificationsInput)).resolves.toEqual({ error: "Too many skills" });
  });
});

describe("uploadUserImageAction", () => {
  it("uploads the file and returns the updated profile on success", async () => {
    const profile = { has_avatar: true } as never;
    mockedUploadUserImage.mockResolvedValueOnce(profile);

    const formData = new FormData();
    const file = new File(["fake"], "avatar.png", { type: "image/png" });
    formData.append("file", file);

    await expect(uploadUserImageAction("avatar", formData)).resolves.toEqual({ profile });
    expect(mockedUploadUserImage).toHaveBeenCalledWith("avatar", file);
  });

  it("rejects a FormData with no file", async () => {
    await expect(uploadUserImageAction("avatar", new FormData())).resolves.toEqual({
      error: "No file provided",
    });
    expect(mockedUploadUserImage).not.toHaveBeenCalled();
  });

  it("returns the upstream error message on failure", async () => {
    mockedUploadUserImage.mockRejectedValueOnce(new AuthApiError("Images must be 5MB or smaller", 413));

    const formData = new FormData();
    formData.append("file", new File(["fake"], "avatar.png", { type: "image/png" }));

    await expect(uploadUserImageAction("avatar", formData)).resolves.toEqual({
      error: "Images must be 5MB or smaller",
    });
  });
});

describe("removeUserImageAction", () => {
  it("clears the image and returns the updated profile on success", async () => {
    const profile = { has_avatar: false } as never;
    mockedRemoveUserImage.mockResolvedValueOnce(profile);

    await expect(removeUserImageAction("avatar")).resolves.toEqual({ profile });
    expect(mockedRemoveUserImage).toHaveBeenCalledWith("avatar");
  });
});

describe("updateAppearanceAction", () => {
  it("saves the accent color and returns the updated settings on success", async () => {
    const settings = { accent_color: "#2563eb" } as never;
    mockedUpdateAppearanceSettings.mockResolvedValueOnce(settings);

    await expect(updateAppearanceAction("#2563eb")).resolves.toEqual({ settings });
    expect(mockedUpdateAppearanceSettings).toHaveBeenCalledWith("#2563eb");
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdateAppearanceSettings.mockRejectedValueOnce(new AuthApiError("Bad color", 422));

    await expect(updateAppearanceAction("blue")).resolves.toEqual({ error: "Bad color" });
  });
});

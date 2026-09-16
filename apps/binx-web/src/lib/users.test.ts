import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/users.ts talks to binx-api exclusively through this shared axios
// instance. Mocking the whole module means `api.get`/`api.patch`/`api.put`
// become `vi.fn()`s we control per-test, so no real HTTP request ever leaves
// the test process.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), patch: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

// lib/users.ts only needs `getAccessToken` from lib/auth — everything else
// (AuthApiError, extractDetailMessage) is real so the error-shaping logic
// under test still runs for real, not against a mock.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, getAccessToken: vi.fn() };
});

import { api } from "@/lib/api";
import { AuthApiError, getAccessToken } from "@/lib/auth";
import {
  changePassword,
  deleteAccount,
  getAppearanceSettings,
  getNotificationSettings,
  getPrivacySettings,
  getTutorialProgress,
  getUserProfile,
  removeUserImage,
  requestEmailChange,
  updateAppearanceSettings,
  updateCurrentUserProfile,
  updateNotificationSettings,
  updatePrivacySettings,
  updateQualifications,
  updateTutorialProgress,
  uploadUserImage,
} from "@/lib/users";

const mockedApi = vi.mocked(api, true);
const mockedGetAccessToken = vi.mocked(getAccessToken);

/** Shapes a fake error the same way axios does for a non-2xx response. */
function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAccessToken.mockResolvedValue("test-access-token");
});

describe("updateCurrentUserProfile", () => {
  it("sends the profile fields with a bearer token and returns the updated user", async () => {
    const updatedUser = { id: "1", full_name: "Jane Doe" };
    mockedApi.patch.mockResolvedValueOnce({ data: updatedUser });

    const result = await updateCurrentUserProfile({
      fullName: "Jane Doe",
      phoneNumber: "555-0100",
      jobTitle: "Producer",
      summary: "Loves spreadsheets.",
    });

    expect(result).toEqual(updatedUser);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      "/users/me",
      { full_name: "Jane Doe", phone_number: "555-0100", job_title: "Producer", summary: "Loves spreadsheets." },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(
      updateCurrentUserProfile({ fullName: null, phoneNumber: null, jobTitle: null, summary: null }),
    ).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.patch).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(422, "Full name is required"));

    await expect(
      updateCurrentUserProfile({ fullName: "", phoneNumber: null, jobTitle: null, summary: null }),
    ).rejects.toEqual(new AuthApiError("Full name is required", 422));
  });
});

describe("getNotificationSettings / updateNotificationSettings", () => {
  const settings = {
    email_product_updates: true,
    email_client_activity: true,
    email_team_mentions: false,
    email_weekly_digest: false,
    email_security_alerts: true,
    inapp_team: true,
    inapp_invoicing: true,
    inapp_projects: true,
    inapp_messages: true,
  };

  it("fetches settings with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: settings });

    const result = await getNotificationSettings();

    expect(result).toEqual(settings);
    expect(mockedApi.get).toHaveBeenCalledWith("/users/me/notification-settings", {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when fetching without a session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(getNotificationSettings()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });

  it("replaces settings with a PUT request", async () => {
    mockedApi.put.mockResolvedValueOnce({ data: settings });

    const result = await updateNotificationSettings(settings);

    expect(result).toEqual(settings);
    expect(mockedApi.put).toHaveBeenCalledWith("/users/me/notification-settings", settings, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("surfaces binx-api's error detail when the update is rejected", async () => {
    mockedApi.put.mockRejectedValueOnce(axiosError(500, "Something went wrong"));

    await expect(updateNotificationSettings(settings)).rejects.toEqual(
      new AuthApiError("Something went wrong", 500),
    );
  });
});

describe("getPrivacySettings / updatePrivacySettings", () => {
  const settings = {
    profile_visibility: "team" as const,
    show_email_to_team: true,
    show_phone_to_team: false,
    activity_status_visible: true,
    analytics_opt_out: false,
  };

  it("fetches settings with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: settings });

    const result = await getPrivacySettings();

    expect(result).toEqual(settings);
    expect(mockedApi.get).toHaveBeenCalledWith("/users/me/privacy-settings", {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("replaces settings with a PUT request", async () => {
    mockedApi.put.mockResolvedValueOnce({ data: settings });

    const result = await updatePrivacySettings(settings);

    expect(result).toEqual(settings);
    expect(mockedApi.put).toHaveBeenCalledWith("/users/me/privacy-settings", settings, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when updating without a session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(updatePrivacySettings(settings)).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.put).not.toHaveBeenCalled();
  });
});

describe("getUserProfile / updateQualifications", () => {
  const profile = {
    has_avatar: false,
    avatar_version: null,
    has_cover: false,
    cover_version: null,
    skills: ["Python"],
    experience: [],
    education: [],
  };

  it("fetches the profile with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: profile });

    const result = await getUserProfile();

    expect(result).toEqual(profile);
    expect(mockedApi.get).toHaveBeenCalledWith("/users/me/profile", {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when fetching without a session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(getUserProfile()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });

  it("sends skills/experience/education together via PATCH", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: profile });

    const result = await updateQualifications({ skills: ["Python"], experience: [], education: [] });

    expect(result).toEqual(profile);
    expect(mockedApi.patch).toHaveBeenCalledWith(
      "/users/me/qualifications",
      { skills: ["Python"], experience: [], education: [] },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("surfaces binx-api's error detail when the update is rejected", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(422, "Too many skills"));

    await expect(updateQualifications({ skills: [], experience: [], education: [] })).rejects.toEqual(
      new AuthApiError("Too many skills", 422),
    );
  });
});

describe("uploadUserImage / removeUserImage", () => {
  const profile = { has_avatar: true, avatar_version: "v1", has_cover: false, cover_version: null };

  it("uploads the file as multipart/form-data, dropping the JSON content-type header", async () => {
    mockedApi.put.mockResolvedValueOnce({ data: profile });
    const file = new File(["fake"], "avatar.png", { type: "image/png" });

    const result = await uploadUserImage("avatar", file);

    expect(result).toEqual(profile);
    expect(mockedApi.put).toHaveBeenCalledWith(
      "/users/me/avatar",
      expect.any(FormData),
      { headers: { Authorization: "Bearer test-access-token", "Content-Type": undefined } },
    );
  });

  it("surfaces binx-api's error detail when the upload is rejected", async () => {
    mockedApi.put.mockRejectedValueOnce(axiosError(413, "Images must be 5MB or smaller"));

    await expect(uploadUserImage("cover", new File(["x"], "c.png"))).rejects.toEqual(
      new AuthApiError("Images must be 5MB or smaller", 413),
    );
  });

  it("clears the image via DELETE", async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: { ...profile, has_avatar: false, avatar_version: null } });

    const result = await removeUserImage("avatar");

    expect(result.has_avatar).toBe(false);
    expect(mockedApi.delete).toHaveBeenCalledWith("/users/me/avatar", {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when removing without a session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(removeUserImage("cover")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });
});

describe("getAppearanceSettings / updateAppearanceSettings", () => {
  it("fetches settings with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { accent_color: "#2563eb" } });

    const result = await getAppearanceSettings();

    expect(result).toEqual({ accent_color: "#2563eb" });
    expect(mockedApi.get).toHaveBeenCalledWith("/users/me/appearance", {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("replaces the accent color with a PUT request", async () => {
    mockedApi.put.mockResolvedValueOnce({ data: { accent_color: "#2563eb" } });

    const result = await updateAppearanceSettings("#2563eb");

    expect(result).toEqual({ accent_color: "#2563eb" });
    expect(mockedApi.put).toHaveBeenCalledWith(
      "/users/me/appearance",
      { accent_color: "#2563eb" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("clears the accent color by passing null", async () => {
    mockedApi.put.mockResolvedValueOnce({ data: { accent_color: null } });

    const result = await updateAppearanceSettings(null);

    expect(result).toEqual({ accent_color: null });
    expect(mockedApi.put).toHaveBeenCalledWith(
      "/users/me/appearance",
      { accent_color: null },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("surfaces binx-api's error detail when the update is rejected", async () => {
    mockedApi.put.mockRejectedValueOnce(axiosError(422, "Bad color"));

    await expect(updateAppearanceSettings("blue")).rejects.toEqual(new AuthApiError("Bad color", 422));
  });
});

describe("getTutorialProgress / updateTutorialProgress", () => {
  const progress = { tour_completed: false, dismissed_popups: [] };

  it("fetches progress with a bearer token", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: progress });

    const result = await getTutorialProgress();

    expect(result).toEqual(progress);
    expect(mockedApi.get).toHaveBeenCalledWith("/users/me/tutorial-progress", {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("throws AuthApiError(401) when fetching without a session", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(getTutorialProgress()).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
  });

  it("replaces progress with a PUT request", async () => {
    const updated = { tour_completed: true, dismissed_popups: ["clients-new"] };
    mockedApi.put.mockResolvedValueOnce({ data: updated });

    const result = await updateTutorialProgress(updated);

    expect(result).toEqual(updated);
    expect(mockedApi.put).toHaveBeenCalledWith("/users/me/tutorial-progress", updated, {
      headers: { Authorization: "Bearer test-access-token" },
    });
  });

  it("surfaces binx-api's error detail when the update is rejected", async () => {
    mockedApi.put.mockRejectedValueOnce(axiosError(422, "Bad progress"));

    await expect(updateTutorialProgress(progress)).rejects.toEqual(new AuthApiError("Bad progress", 422));
  });
});

describe("requestEmailChange", () => {
  it("sends the current password and new email with a bearer token", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { message: "Check your new inbox to confirm the change." } });

    const result = await requestEmailChange({ currentPassword: "correct-password", newEmail: "new@example.com" });

    expect(result).toBe("Check your new inbox to confirm the change.");
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/auth/change-email",
      { current_password: "correct-password", new_email: "new@example.com" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(
      requestEmailChange({ currentPassword: "correct-password", newEmail: "new@example.com" }),
    ).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(401, "Incorrect password"));

    await expect(
      requestEmailChange({ currentPassword: "wrong-password", newEmail: "new@example.com" }),
    ).rejects.toEqual(new AuthApiError("Incorrect password", 401));
  });
});

describe("changePassword", () => {
  it("sends the current and new password with a bearer token", async () => {
    mockedApi.patch.mockResolvedValueOnce({ data: {} });

    await changePassword({ currentPassword: "old-password", newPassword: "new-password-123" });

    expect(mockedApi.patch).toHaveBeenCalledWith(
      "/users/me/password",
      { current_password: "old-password", new_password: "new-password-123" },
      { headers: { Authorization: "Bearer test-access-token" } },
    );
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(
      changePassword({ currentPassword: "old-password", newPassword: "new-password-123" }),
    ).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.patch).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.patch.mockRejectedValueOnce(axiosError(401, "Incorrect password"));

    await expect(
      changePassword({ currentPassword: "wrong-password", newPassword: "new-password-123" }),
    ).rejects.toEqual(new AuthApiError("Incorrect password", 401));
  });
});

describe("deleteAccount", () => {
  it("sends the current password as the DELETE request body, with a bearer token", async () => {
    mockedApi.delete.mockResolvedValueOnce({ data: {} });

    await deleteAccount("correct-password");

    expect(mockedApi.delete).toHaveBeenCalledWith("/users/me", {
      headers: { Authorization: "Bearer test-access-token" },
      data: { current_password: "correct-password" },
    });
  });

  it("throws AuthApiError(401) when there is no access token", async () => {
    mockedGetAccessToken.mockResolvedValueOnce(undefined);

    await expect(deleteAccount("correct-password")).rejects.toMatchObject({ name: "AuthApiError", status: 401 });
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  it("surfaces binx-api's error detail as an AuthApiError", async () => {
    mockedApi.delete.mockRejectedValueOnce(axiosError(401, "Incorrect password"));

    await expect(deleteAccount("wrong-password")).rejects.toEqual(new AuthApiError("Incorrect password", 401));
  });
});

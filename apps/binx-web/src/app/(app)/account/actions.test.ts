import { beforeEach, describe, expect, it, vi } from "vitest";

// These actions only orchestrate: call the matching lib/users function,
// translate a thrown AuthApiError into a returned { error }. We mock the lib
// calls so this test proves the ORCHESTRATION is correct, without a real
// network call.
vi.mock("@/lib/users", () => ({
  updateNotificationSettings: vi.fn(),
  updatePrivacySettings: vi.fn(),
  requestEmailChange: vi.fn(),
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
}));

// deleteAccountAction additionally clears cookies and redirects on success —
// mock both, keeping AuthApiError real (via importOriginal) since the error
// path is asserted against actual instances of it.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, clearAuthCookies: vi.fn(async () => undefined) };
});

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

import { AuthApiError, clearAuthCookies } from "@/lib/auth";
import { changePassword, deleteAccount, requestEmailChange, updateNotificationSettings, updatePrivacySettings } from "@/lib/users";
import {
  changePasswordAction,
  deleteAccountAction,
  requestEmailChangeAction,
  updateNotificationSettingsAction,
  updatePrivacySettingsAction,
} from "./actions";

const mockedUpdateNotificationSettings = vi.mocked(updateNotificationSettings);
const mockedUpdatePrivacySettings = vi.mocked(updatePrivacySettings);
const mockedRequestEmailChange = vi.mocked(requestEmailChange);
const mockedChangePassword = vi.mocked(changePassword);
const mockedDeleteAccount = vi.mocked(deleteAccount);
const mockedClearAuthCookies = vi.mocked(clearAuthCookies);
const mockedRedirect = vi.mocked(redirect);

const notificationSettings = {
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

const privacySettings = {
  profile_visibility: "team" as const,
  show_email_to_team: true,
  show_phone_to_team: false,
  activity_status_visible: true,
  analytics_opt_out: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateNotificationSettingsAction", () => {
  it("saves the settings and returns no error on success", async () => {
    mockedUpdateNotificationSettings.mockResolvedValueOnce(notificationSettings);

    await expect(updateNotificationSettingsAction(notificationSettings)).resolves.toEqual({});
    expect(mockedUpdateNotificationSettings).toHaveBeenCalledWith(notificationSettings);
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdateNotificationSettings.mockRejectedValueOnce(new AuthApiError("Not authenticated", 401));

    await expect(updateNotificationSettingsAction(notificationSettings)).resolves.toEqual({
      error: "Not authenticated",
    });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedUpdateNotificationSettings.mockRejectedValueOnce(new Error("network down"));

    await expect(updateNotificationSettingsAction(notificationSettings)).resolves.toEqual({
      error: "Unable to save notification settings",
    });
  });
});

describe("updatePrivacySettingsAction", () => {
  it("saves the settings and returns no error on success", async () => {
    mockedUpdatePrivacySettings.mockResolvedValueOnce(privacySettings);

    await expect(updatePrivacySettingsAction(privacySettings)).resolves.toEqual({});
    expect(mockedUpdatePrivacySettings).toHaveBeenCalledWith(privacySettings);
  });

  it("returns the upstream error message on failure", async () => {
    mockedUpdatePrivacySettings.mockRejectedValueOnce(new AuthApiError("Not authenticated", 401));

    await expect(updatePrivacySettingsAction(privacySettings)).resolves.toEqual({ error: "Not authenticated" });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedUpdatePrivacySettings.mockRejectedValueOnce(new Error("network down"));

    await expect(updatePrivacySettingsAction(privacySettings)).resolves.toEqual({
      error: "Unable to save privacy settings",
    });
  });
});

describe("requestEmailChangeAction", () => {
  const input = { currentPassword: "correct-password", newEmail: "new@example.com" };

  it("returns the success message on success", async () => {
    mockedRequestEmailChange.mockResolvedValueOnce("Check your new inbox to confirm the change.");

    await expect(requestEmailChangeAction(input)).resolves.toEqual({
      message: "Check your new inbox to confirm the change.",
    });
    expect(mockedRequestEmailChange).toHaveBeenCalledWith({ currentPassword: input.currentPassword, newEmail: input.newEmail });
  });

  it("returns the upstream error message on failure", async () => {
    mockedRequestEmailChange.mockRejectedValueOnce(new AuthApiError("Incorrect password", 401));

    await expect(requestEmailChangeAction(input)).resolves.toEqual({ error: "Incorrect password" });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedRequestEmailChange.mockRejectedValueOnce(new Error("network down"));

    await expect(requestEmailChangeAction(input)).resolves.toEqual({ error: "Unable to change your email" });
  });
});

describe("changePasswordAction", () => {
  const input = { currentPassword: "correct-password", newPassword: "new-password-123" };

  it("saves the new password and returns no error on success", async () => {
    mockedChangePassword.mockResolvedValueOnce(undefined);

    await expect(changePasswordAction(input)).resolves.toEqual({});
    expect(mockedChangePassword).toHaveBeenCalledWith(input);
  });

  it("returns the upstream error message on failure", async () => {
    mockedChangePassword.mockRejectedValueOnce(new AuthApiError("Incorrect password", 401));

    await expect(changePasswordAction(input)).resolves.toEqual({ error: "Incorrect password" });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedChangePassword.mockRejectedValueOnce(new Error("network down"));

    await expect(changePasswordAction(input)).resolves.toEqual({ error: "Unable to change your password" });
  });
});

describe("deleteAccountAction", () => {
  it("clears the session and redirects to /auth/login on success", async () => {
    mockedDeleteAccount.mockResolvedValueOnce(undefined);

    await expect(deleteAccountAction("correct-password")).rejects.toThrow("REDIRECT:/auth/login");

    expect(mockedDeleteAccount).toHaveBeenCalledWith("correct-password");
    expect(mockedClearAuthCookies).toHaveBeenCalledOnce();
    expect(mockedRedirect).toHaveBeenCalledWith("/auth/login");
  });

  it("returns the upstream error message without clearing the session", async () => {
    mockedDeleteAccount.mockRejectedValueOnce(new AuthApiError("Incorrect password", 401));

    await expect(deleteAccountAction("wrong-password")).resolves.toEqual({ error: "Incorrect password" });
    expect(mockedClearAuthCookies).not.toHaveBeenCalled();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedDeleteAccount.mockRejectedValueOnce(new Error("network down"));

    await expect(deleteAccountAction("correct-password")).resolves.toEqual({
      error: "Unable to delete your account",
    });
  });
});

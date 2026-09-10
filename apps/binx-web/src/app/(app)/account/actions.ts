/**
 * actions.ts - Account Settings
 *
 * Server actions for the account settings page: notification/privacy
 * settings, plus email, password, and account-deletion changes. All of
 * these are authenticated mutations that call binx-api directly via
 * `lib/users.ts` rather than going through an internal `/api/*` proxy route
 * — none of them set session cookies except deleteAccountAction, which
 * clears them on success since the account (and thus the session) is gone.
 *
 * @module apps/binx-web/src/app/(app)/account/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError, clearAuthCookies } from "@/lib/auth";
import {
  NotificationSettings,
  PrivacySettings,
  changePassword,
  deleteAccount,
  requestEmailChange,
  updateNotificationSettings,
  updatePrivacySettings,
} from "@/lib/users";

export interface UpdateSettingsActionResult {
  error?: string;
}

export async function updateNotificationSettingsAction(
  settings: NotificationSettings,
): Promise<UpdateSettingsActionResult> {
  try {
    await updateNotificationSettings(settings);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to save notification settings" };
  }

  return {};
}

export async function updatePrivacySettingsAction(settings: PrivacySettings): Promise<UpdateSettingsActionResult> {
  try {
    await updatePrivacySettings(settings);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to save privacy settings" };
  }

  return {};
}

export interface RequestEmailChangeActionInput {
  currentPassword: string;
  newEmail: string;
}

export interface RequestEmailChangeActionResult {
  error?: string;
  message?: string;
}

export async function requestEmailChangeAction(
  input: RequestEmailChangeActionInput,
): Promise<RequestEmailChangeActionResult> {
  try {
    const message = await requestEmailChange({ currentPassword: input.currentPassword, newEmail: input.newEmail });
    return { message };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to change your email" };
  }
}

export interface ChangePasswordActionInput {
  currentPassword: string;
  newPassword: string;
}

export async function changePasswordAction(input: ChangePasswordActionInput): Promise<UpdateSettingsActionResult> {
  try {
    await changePassword(input);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to change your password" };
  }

  return {};
}

export async function deleteAccountAction(currentPassword: string): Promise<UpdateSettingsActionResult> {
  try {
    await deleteAccount(currentPassword);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to delete your account" };
  }

  // The account (and with it, the session) no longer exists — clear the
  // now-meaningless cookies and send the user back to login.
  await clearAuthCookies();
  redirect("/auth/login");
}

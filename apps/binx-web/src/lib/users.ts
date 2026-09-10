/**
 * users.ts
 *
 * Server-only helpers for authenticated calls to binx-api's `/users/*`
 * endpoints. Unlike the session-establishing calls in `lib/auth.ts`, these
 * don't set any cookies — they just attach the existing access token.
 *
 * @module apps/binx-web/src/lib/users.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import { AuthApiError, CurrentUser, extractDetailMessage, getAccessToken } from "@/lib/auth";

export interface UpdateProfileInput {
  fullName?: string | null;
  phoneNumber: string | null;
  jobTitle: string | null;
  summary?: string | null;
}

/**
 * updateCurrentUserProfile
 *
 * Updates the signed-in user's profile (name / phone number / job title /
 * bio) via `PATCH /users/me`. A `null` (or omitted) field is left untouched
 * server-side.
 *
 * @function updateCurrentUserProfile
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the update.
 */
export async function updateCurrentUserProfile({
  fullName = null,
  phoneNumber,
  jobTitle,
  summary = null,
}: UpdateProfileInput): Promise<CurrentUser> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }

  try {
    const { data } = await api.patch<CurrentUser>(
      "/users/me",
      { full_name: fullName, phone_number: phoneNumber, job_title: jobTitle, summary },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to update profile"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * NotificationSettings
 *
 * The signed-in user's notification preferences, as returned by binx-api.
 *
 * @interface NotificationSettings
 */
export interface NotificationSettings {
  email_product_updates: boolean;
  email_client_activity: boolean;
  email_team_mentions: boolean;
  email_weekly_digest: boolean;
  email_security_alerts: boolean;
  /** In-app notification toggles — one per notification category. */
  inapp_team: boolean;
  inapp_invoicing: boolean;
  inapp_projects: boolean;
  inapp_messages: boolean;
}

/**
 * PrivacySettings
 *
 * The signed-in user's privacy preferences, as returned by binx-api.
 *
 * @interface PrivacySettings
 */
export interface PrivacySettings {
  profile_visibility: "team" | "private";
  show_email_to_team: boolean;
  show_phone_to_team: boolean;
  activity_status_visible: boolean;
  analytics_opt_out: boolean;
}

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * getNotificationSettings
 *
 * Fetches the signed-in user's notification settings via
 * `GET /users/me/notification-settings`. binx-api creates a default row on
 * first access, so this always resolves rather than 404ing for new users.
 *
 * @function getNotificationSettings
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<NotificationSettings>("/users/me/notification-settings", { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to load notification settings"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * updateNotificationSettings
 *
 * Replaces the signed-in user's notification settings via
 * `PUT /users/me/notification-settings`. Unlike the profile update, this is
 * a full replace — the settings form always submits every toggle together.
 *
 * @function updateNotificationSettings
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the update.
 */
export async function updateNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings> {
  const headers = await authHeader();

  try {
    const { data } = await api.put<NotificationSettings>("/users/me/notification-settings", settings, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to update notification settings"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * getPrivacySettings
 *
 * Fetches the signed-in user's privacy settings via
 * `GET /users/me/privacy-settings`. binx-api creates a default row on first
 * access, so this always resolves rather than 404ing for new users.
 *
 * @function getPrivacySettings
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export async function getPrivacySettings(): Promise<PrivacySettings> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<PrivacySettings>("/users/me/privacy-settings", { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to load privacy settings"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * updatePrivacySettings
 *
 * Replaces the signed-in user's privacy settings via
 * `PUT /users/me/privacy-settings`. Like updateNotificationSettings, this is
 * a full replace of every field at once.
 *
 * @function updatePrivacySettings
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the update.
 */
export async function updatePrivacySettings(settings: PrivacySettings): Promise<PrivacySettings> {
  const headers = await authHeader();

  try {
    const { data } = await api.put<PrivacySettings>("/users/me/privacy-settings", settings, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to update privacy settings"),
        error.response.status,
      );
    }
    throw error;
  }
}

export interface RequestEmailChangeInput {
  currentPassword: string;
  newEmail: string;
}

/**
 * requestEmailChange
 *
 * Starts an email change via `POST /auth/change-email`: binx-api verifies
 * the current password, then emails a confirmation link to the NEW address.
 * The account's email doesn't change until that link is confirmed (see
 * `confirmEmailChange` in lib/auth.ts).
 *
 * @function requestEmailChange
 * @throws {AuthApiError} - Thrown if not authenticated, the password is wrong, or the email is taken.
 */
export async function requestEmailChange({ currentPassword, newEmail }: RequestEmailChangeInput): Promise<string> {
  const headers = await authHeader();

  try {
    const { data } = await api.post<{ message: string }>(
      "/auth/change-email",
      { current_password: currentPassword, new_email: newEmail },
      { headers },
    );
    return data.message;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to change your email"),
        error.response.status,
      );
    }
    throw error;
  }
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * changePassword
 *
 * Changes the signed-in user's password via `PATCH /users/me/password`,
 * requiring the current password as proof of ownership.
 *
 * @function changePassword
 * @throws {AuthApiError} - Thrown if not authenticated, or the current password is wrong.
 */
export async function changePassword({ currentPassword, newPassword }: ChangePasswordInput): Promise<void> {
  const headers = await authHeader();

  try {
    await api.patch(
      "/users/me/password",
      { current_password: currentPassword, new_password: newPassword },
      { headers },
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to change your password"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * deleteAccount
 *
 * Permanently deletes the signed-in user's account via `DELETE /users/me`,
 * requiring the current password as proof of ownership. Does not clear the
 * session cookies itself — the caller (see app/(app)/account/actions.ts) is
 * responsible for that once the delete succeeds.
 *
 * @function deleteAccount
 * @throws {AuthApiError} - Thrown if not authenticated, or the current password is wrong.
 */
export async function deleteAccount(currentPassword: string): Promise<void> {
  const headers = await authHeader();

  try {
    await api.delete("/users/me", { headers, data: { current_password: currentPassword } });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to delete your account"),
        error.response.status,
      );
    }
    throw error;
  }
}

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
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, CurrentUser, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { UserImageKind } from "@/lib/users-client";

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
export type NotificationSettings = Schemas["NotificationSettingsRead"];

/**
 * PrivacySettings
 *
 * The signed-in user's privacy preferences, as returned by binx-api.
 *
 * @interface PrivacySettings
 */
export type PrivacySettings = Omit<Schemas["PrivacySettingsRead"], "profile_visibility"> & {
  profile_visibility: "team" | "private";
};

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

// ---- Profile: photos + qualifications ----------------------------------

// binx-api's response always populates every field (pydantic's "has a
// default" just means optional on *input*), so narrow the generated
// optional-with-default fields to always-present-but-nullable — same
// narrowing PrivacySettings below does for profile_visibility.
export type ExperienceEntry = Omit<Schemas["ExperienceEntry"], "end_year" | "description"> & {
  end_year: number | null;
  description: string | null;
};
export type EducationEntry = Omit<
  Schemas["EducationEntry"],
  "start_year" | "end_year" | "field_of_study" | "description"
> & {
  start_year: number | null;
  end_year: number | null;
  field_of_study: string | null;
  description: string | null;
};

/**
 * UserProfileData
 *
 * Photos + qualifications for the signed-in user's own /profile pages, as
 * returned by binx-api.
 *
 * @interface UserProfileData
 */
export type UserProfileData = Omit<Schemas["UserProfileRead"], "experience" | "education"> & {
  experience: ExperienceEntry[];
  education: EducationEntry[];
};

export interface QualificationsInput {
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
}

/**
 * getUserProfile
 *
 * Fetches the signed-in user's photos + qualifications via
 * `GET /users/me/profile`. binx-api creates a default row on first access,
 * so this always resolves rather than 404ing for new users.
 *
 * @function getUserProfile
 * @throws {AuthApiError} - Thrown if not authenticated.
 */
export async function getUserProfile(): Promise<UserProfileData> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<UserProfileData>("/users/me/profile", { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to load your profile"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * updateQualifications
 *
 * Replaces the signed-in user's skills, experience, and education together
 * via `PATCH /users/me/qualifications` — the qualifications form always
 * submits its whole state at once, same as updateNotificationSettings.
 *
 * @function updateQualifications
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the update.
 */
export async function updateQualifications(input: QualificationsInput): Promise<UserProfileData> {
  const headers = await authHeader();

  try {
    const { data } = await api.patch<UserProfileData>(
      "/users/me/qualifications",
      { skills: input.skills, experience: input.experience, education: input.education },
      { headers },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to save your skills and experience"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * uploadUserImage
 *
 * Uploads the signed-in user's avatar or cover via `PUT /users/me/{kind}`
 * (multipart/form-data) — same shape as agencies.ts's uploadAgencyImage.
 * binx-api rejects non-images and anything over its size cap.
 *
 * @function uploadUserImage
 * @throws {AuthApiError} - Thrown if not authenticated, the type isn't allowed, or it's too large.
 */
export async function uploadUserImage(kind: UserImageKind, file: File): Promise<UserProfileData> {
  const headers = await authHeader();
  const formData = new FormData();
  formData.append("file", file);

  try {
    // Delete the inherited `Content-Type: application/json` so axios sets
    // its own multipart boundary.
    const { data } = await api.put<UserProfileData>(`/users/me/${kind}`, formData, {
      headers: { ...headers, "Content-Type": undefined },
    });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to upload image"), error.response.status);
    }
    throw error;
  }
}

/**
 * removeUserImage
 *
 * Clears the signed-in user's avatar or cover via `DELETE /users/me/{kind}`.
 *
 * @function removeUserImage
 * @throws {AuthApiError} - Thrown if not authenticated.
 */
export async function removeUserImage(kind: UserImageKind): Promise<UserProfileData> {
  const headers = await authHeader();

  try {
    const { data } = await api.delete<UserProfileData>(`/users/me/${kind}`, { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(extractDetailMessage(error.response.data, "Unable to remove image"), error.response.status);
    }
    throw error;
  }
}

// ---- Appearance ----------------------------------------------------------

/**
 * AppearanceSettings
 *
 * The signed-in user's personal appearance preference for their own view of
 * the staff portal, as returned by binx-api.
 *
 * @interface AppearanceSettings
 */
export type AppearanceSettings = Schemas["AppearanceSettingsRead"];

/**
 * getAppearanceSettings
 *
 * Fetches the signed-in user's appearance settings via
 * `GET /users/me/appearance`. binx-api creates a default row on first
 * access, so this always resolves rather than 404ing for new users.
 *
 * @function getAppearanceSettings
 * @throws {AuthApiError} - Thrown if not authenticated.
 */
export async function getAppearanceSettings(): Promise<AppearanceSettings> {
  const headers = await authHeader();

  try {
    const { data } = await api.get<AppearanceSettings>("/users/me/appearance", { headers });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to load appearance settings"),
        error.response.status,
      );
    }
    throw error;
  }
}

/**
 * updateAppearanceSettings
 *
 * Replaces the signed-in user's accent color via `PUT /users/me/appearance`.
 *
 * @function updateAppearanceSettings
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the update.
 */
export async function updateAppearanceSettings(accentColor: string | null): Promise<AppearanceSettings> {
  const headers = await authHeader();

  try {
    const { data } = await api.put<AppearanceSettings>(
      "/users/me/appearance",
      { accent_color: accentColor },
      { headers },
    );
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new AuthApiError(
        extractDetailMessage(error.response.data, "Unable to update appearance settings"),
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

/**
 * actions.ts - Profile
 *
 * Server actions for saving edits made across the profile tabs (Details,
 * Skills & Experience, Photos, Appearance). Plain authenticated mutations —
 * no session cookies change — so they call binx-api directly via
 * `lib/users.ts` rather than going through an internal `/api/*` proxy route
 * (image bytes are the one exception; see app/api/users/me/.../route.ts).
 *
 * @module apps/binx-web/src/app/(app)/profile/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import {
  AppearanceSettings,
  EducationEntry,
  ExperienceEntry,
  removeUserImage,
  updateAppearanceSettings,
  updateCurrentUserProfile,
  updateQualifications,
  uploadUserImage,
  UserProfileData,
} from "@/lib/users";
import type { UserImageKind } from "@/lib/users-client";

export interface UpdateProfileActionInput {
  fullName: string;
  jobTitle: string | null;
  phoneNumber: string | null;
  summary: string | null;
}

export interface UpdateProfileActionResult {
  error?: string;
}

export async function updateProfileAction(input: UpdateProfileActionInput): Promise<UpdateProfileActionResult> {
  try {
    await updateCurrentUserProfile({
      fullName: input.fullName,
      jobTitle: input.jobTitle,
      phoneNumber: input.phoneNumber,
      summary: input.summary,
    });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to save your profile" };
  }

  return {};
}

export interface UpdateQualificationsActionInput {
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
}

export interface UserProfileActionResult {
  error?: string;
  profile?: UserProfileData;
}

export async function updateQualificationsAction(
  input: UpdateQualificationsActionInput,
): Promise<UserProfileActionResult> {
  try {
    const profile = await updateQualifications(input);
    return { profile };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to save your skills and experience" };
  }
}

export async function uploadUserImageAction(
  kind: UserImageKind,
  formData: FormData,
): Promise<UserProfileActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "No file provided" };
  }

  try {
    const profile = await uploadUserImage(kind, file);
    return { profile };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to upload image" };
  }
}

export async function removeUserImageAction(kind: UserImageKind): Promise<UserProfileActionResult> {
  try {
    const profile = await removeUserImage(kind);
    return { profile };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to remove image" };
  }
}

export interface AppearanceActionResult {
  error?: string;
  settings?: AppearanceSettings;
}

export async function updateAppearanceAction(accentColor: string | null): Promise<AppearanceActionResult> {
  try {
    const settings = await updateAppearanceSettings(accentColor);
    return { settings };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to update appearance settings" };
  }
}

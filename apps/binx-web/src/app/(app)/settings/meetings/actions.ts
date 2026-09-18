/**
 * actions.ts - Agency Settings · Meetings
 *
 * Server actions for the meeting-scheduling settings page — plain
 * authenticated mutations, calling binx-api directly via `lib/meetings.ts`.
 * Every action returns `{ error?, ... }`, the same shape the other settings
 * actions use.
 *
 * @module apps/binx-web/src/app/(app)/settings/meetings/actions.ts
 * @author Binx.io
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import {
  type AvailabilityRule,
  type AvailabilityRuleInput,
  type MeetingSettings,
  type MeetingSettingsUpdate,
  putAvailabilityRules,
  updateMeetingSettings,
} from "@/lib/meetings";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface MeetingSettingsActionResult {
  error?: string;
  settings?: MeetingSettings;
}

export async function updateMeetingSettingsAction(
  agencyId: string,
  input: MeetingSettingsUpdate,
): Promise<MeetingSettingsActionResult> {
  try {
    const settings = await updateMeetingSettings(agencyId, input);
    revalidatePath("/settings/meetings");
    return { settings };
  } catch (error) {
    return errorResult(error, "Unable to update meeting settings");
  }
}

export interface AvailabilityRulesActionResult {
  error?: string;
  rules?: AvailabilityRule[];
}

export async function putAvailabilityRulesAction(
  agencyId: string,
  rules: AvailabilityRuleInput[],
): Promise<AvailabilityRulesActionResult> {
  try {
    const saved = await putAvailabilityRules(agencyId, rules);
    revalidatePath("/settings/meetings");
    return { rules: saved };
  } catch (error) {
    return errorResult(error, "Unable to save availability");
  }
}

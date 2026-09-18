/**
 * actions.ts - Meetings
 *
 * Server actions for staff scheduling and cancelling meetings — plain
 * authenticated mutations, calling binx-api directly via `lib/meetings.ts`.
 * Every action returns `{ error?, ... }`, the same shape the other feature
 * actions use.
 *
 * @module apps/binx-web/src/app/(app)/meetings/actions.ts
 * @author Binx.io
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { cancelMeeting, createMeeting, type Meeting, type MeetingCreateInput } from "@/lib/meetings";

function errorResult(error: unknown, fallback: string): { error: string } {
  if (error instanceof AuthApiError) {
    return { error: error.message };
  }
  return { error: fallback };
}

export interface MeetingActionResult {
  error?: string;
  meeting?: Meeting;
}

export async function createMeetingAction(agencyId: string, input: MeetingCreateInput): Promise<MeetingActionResult> {
  try {
    const meeting = await createMeeting(agencyId, input);
    revalidatePath("/meetings");
    revalidatePath(`/clients/${meeting.client_id}/meetings`);
    return { meeting };
  } catch (error) {
    return errorResult(error, "Unable to schedule meeting");
  }
}

export async function cancelMeetingAction(agencyId: string, meetingId: string): Promise<MeetingActionResult> {
  try {
    const meeting = await cancelMeeting(agencyId, meetingId);
    revalidatePath("/meetings");
    revalidatePath(`/clients/${meeting.client_id}/meetings`);
    return { meeting };
  } catch (error) {
    return errorResult(error, "Unable to cancel meeting");
  }
}

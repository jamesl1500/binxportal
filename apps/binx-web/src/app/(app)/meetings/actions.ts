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
import {
  cancelMeeting,
  createMeeting,
  updateMeeting,
  type Meeting,
  type MeetingCreateInput,
  type MeetingUpdateInput,
} from "@/lib/meetings";

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

/** Every surface a meeting can show up on — revalidated after any mutation
 * so the dashboard card, the client's meetings tab, and the project overview
 * card all reflect the change without a manual refresh. */
function revalidateMeetingSurfaces(meeting: Meeting): void {
  revalidatePath("/meetings");
  revalidatePath("/dashboard");
  revalidatePath(`/clients/${meeting.client_id}/meetings`);
  revalidatePath(`/clients/${meeting.client_id}`);
  if (meeting.project_id) {
    revalidatePath(`/projects/${meeting.project_id}`);
  }
}

export async function createMeetingAction(agencyId: string, input: MeetingCreateInput): Promise<MeetingActionResult> {
  try {
    const meeting = await createMeeting(agencyId, input);
    revalidateMeetingSurfaces(meeting);
    return { meeting };
  } catch (error) {
    return errorResult(error, "Unable to schedule meeting");
  }
}

export async function updateMeetingAction(
  agencyId: string,
  meetingId: string,
  input: MeetingUpdateInput,
): Promise<MeetingActionResult> {
  try {
    const meeting = await updateMeeting(agencyId, meetingId, input);
    revalidateMeetingSurfaces(meeting);
    return { meeting };
  } catch (error) {
    return errorResult(error, "Unable to update meeting");
  }
}

export async function cancelMeetingAction(agencyId: string, meetingId: string): Promise<MeetingActionResult> {
  try {
    const meeting = await cancelMeeting(agencyId, meetingId);
    revalidateMeetingSurfaces(meeting);
    return { meeting };
  } catch (error) {
    return errorResult(error, "Unable to cancel meeting");
  }
}

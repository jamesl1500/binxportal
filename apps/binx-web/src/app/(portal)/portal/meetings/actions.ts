/**
 * actions.ts - Portal Meetings
 *
 * The client-side mutations for self-service booking: fetching open slots
 * (re-called by BookMeetingDialog on the 409-recovery path, since the
 * dialog can't call server-only `lib/portal.ts` helpers directly), booking
 * one, and cancelling. `status` is threaded through the error result so the
 * dialog can tell a 409 (someone else took the slot) apart from any other
 * failure and react differently.
 *
 * @module apps/binx-web/src/app/(portal)/portal/meetings/actions.ts
 * @author Binx.io
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import {
  bookPortalMeeting,
  cancelPortalMeeting,
  getPortalAvailableSlots,
  type PortalMeeting,
  type PortalMeetingBookingInput,
  type PortalSlot,
} from "@/lib/portal";

function errorResult(error: unknown, fallback: string): { error: string; status?: number } {
  if (error instanceof AuthApiError) {
    return { error: error.message, status: error.status };
  }
  return { error: fallback };
}

export interface PortalSlotsActionResult {
  error?: string;
  status?: number;
  slots?: PortalSlot[];
}

export async function getPortalAvailableSlotsAction(fromDate: string, toDate?: string): Promise<PortalSlotsActionResult> {
  try {
    const slots = await getPortalAvailableSlots(fromDate, toDate);
    return { slots };
  } catch (error) {
    return errorResult(error, "Unable to load available times");
  }
}

export interface PortalMeetingActionResult {
  error?: string;
  status?: number;
  meeting?: PortalMeeting;
}

export async function bookPortalMeetingAction(input: PortalMeetingBookingInput): Promise<PortalMeetingActionResult> {
  try {
    const meeting = await bookPortalMeeting(input);
    revalidatePath("/portal/meetings");
    return { meeting };
  } catch (error) {
    return errorResult(error, "Unable to book that time");
  }
}

export async function cancelPortalMeetingAction(meetingId: string): Promise<PortalMeetingActionResult> {
  try {
    const meeting = await cancelPortalMeeting(meetingId);
    revalidatePath("/portal/meetings");
    return { meeting };
  } catch (error) {
    return errorResult(error, "Unable to cancel this meeting");
  }
}

/**
 * meetings.ts
 *
 * Server-only helpers for binx-api's `/agencies/{agencyId}/meeting-settings`,
 * `/availability-rules`, and `/meetings*` endpoints — staff scheduling +
 * the settings that drive the client portal's self-service booking slots.
 * Same shape as `lib/invoicing.ts`: attach the access token, map errors to
 * `AuthApiError` via `apiError`.
 *
 * @module apps/binx-web/src/lib/meetings.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import { groupSlotsByLocalDay, type Slot } from "@/lib/meetings-client";

export { groupSlotsByLocalDay };
export type { Slot };

async function authHeader(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiError(error: unknown, fallback: string): AuthApiError | unknown {
  if (axios.isAxiosError(error) && error.response) {
    return new AuthApiError(extractDetailMessage(error.response.data, fallback), error.response.status);
  }
  return error;
}

// ---- Types ----

export type MeetingSettings = Schemas["MeetingSettingsRead"];
export type MeetingSettingsUpdate = Schemas["MeetingSettingsUpdate"];
export type AvailabilityRule = Schemas["AvailabilityRuleRead"];
export type AvailabilityRuleInput = Schemas["AvailabilityRuleInput"];
export type Meeting = Schemas["MeetingRead"];
export type MeetingCreateInput = Schemas["MeetingCreate"];
export type MeetingUpdateInput = Schemas["MeetingUpdate"];

export interface MeetingFilter {
  clientId?: string;
  projectId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}

// ---- Settings ----

/**
 * getMeetingSettings
 *
 * Fetches the agency's scheduling defaults (timezone, slot length, booking
 * notice/window, self-service toggle) via `GET /agencies/{agencyId}/meeting-settings`.
 * binx-api creates a default row on first access, so this always resolves.
 *
 * @function getMeetingSettings
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export async function getMeetingSettings(agencyId: string): Promise<MeetingSettings> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<MeetingSettings>(`/agencies/${agencyId}/meeting-settings`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load meeting settings");
  }
}

/**
 * updateMeetingSettings
 *
 * Replaces the agency's scheduling defaults via `PATCH /agencies/{agencyId}/meeting-settings`
 * — owner/admin only. Full replace, same convention as notification settings.
 *
 * @function updateMeetingSettings
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't an owner/admin.
 */
export async function updateMeetingSettings(
  agencyId: string,
  settings: MeetingSettingsUpdate,
): Promise<MeetingSettings> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<MeetingSettings>(`/agencies/${agencyId}/meeting-settings`, settings, {
      headers,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update meeting settings");
  }
}

// ---- Availability rules ----

/**
 * getAvailabilityRules
 *
 * The agency's recurring weekly availability blocks via
 * `GET /agencies/{agencyId}/availability-rules`.
 *
 * @function getAvailabilityRules
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export async function getAvailabilityRules(agencyId: string): Promise<AvailabilityRule[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<AvailabilityRule[]>(`/agencies/${agencyId}/availability-rules`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load availability");
  }
}

/**
 * putAvailabilityRules
 *
 * Replaces the agency's whole weekly schedule at once via
 * `PUT /agencies/{agencyId}/availability-rules` — owner/admin only. The
 * editor always submits every rule together, so this is a full replace, not
 * a merge.
 *
 * @function putAvailabilityRules
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't an owner/admin.
 */
export async function putAvailabilityRules(
  agencyId: string,
  rules: AvailabilityRuleInput[],
): Promise<AvailabilityRule[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.put<AvailabilityRule[]>(`/agencies/${agencyId}/availability-rules`, rules, {
      headers,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to save availability");
  }
}

// ---- Slots ----

/**
 * getAvailableSlots
 *
 * Open booking slots for the agency in `[fromDate, toDate]` (ISO date
 * strings) via `GET /agencies/{agencyId}/meetings/slots` — the same
 * computation the client portal's booking flow uses, so staff can preview
 * exactly what a client would see.
 *
 * @function getAvailableSlots
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export async function getAvailableSlots(agencyId: string, fromDate: string, toDate?: string): Promise<Slot[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Slot[]>(`/agencies/${agencyId}/meetings/slots`, {
      headers,
      params: { from_date: fromDate, to_date: toDate },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load available times");
  }
}

// ---- Meetings ----

/**
 * getMeetings
 *
 * Lists the agency's meetings via `GET /agencies/{agencyId}/meetings`,
 * optionally filtered by client, project, status, or date range.
 *
 * @function getMeetings
 * @throws {AuthApiError} - Thrown if not authenticated, or binx-api rejects the request.
 */
export async function getMeetings(agencyId: string, filter: MeetingFilter = {}): Promise<Meeting[]> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<Meeting[]>(`/agencies/${agencyId}/meetings`, {
      headers,
      params: {
        client_id: filter.clientId,
        project_id: filter.projectId,
        status: filter.status,
        from_date: filter.fromDate,
        to_date: filter.toDate,
      },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load meetings");
  }
}

/**
 * createMeeting
 *
 * Staff-schedules a meeting directly via `POST /agencies/{agencyId}/meetings`
 * — bypasses the portal's booking-notice window (staff can schedule
 * same-day), but still rejects an overlapping time.
 *
 * @function createMeeting
 * @throws {AuthApiError} - Thrown if not authenticated, or the slot is no longer available (409).
 */
export async function createMeeting(agencyId: string, input: MeetingCreateInput): Promise<Meeting> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<Meeting>(`/agencies/${agencyId}/meetings`, input, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to schedule meeting");
  }
}

/**
 * updateMeeting
 *
 * Edits an existing, still-scheduled meeting via `PATCH
 * /agencies/{agencyId}/meetings/{meetingId}` — full replace of the editable
 * fields, same convention as `updateMeetingSettings`. Changing `starts_at`
 * reschedules it, subject to the same overlap guard `createMeeting` uses.
 *
 * @function updateMeeting
 * @throws {AuthApiError} - Thrown if not authenticated, the meeting is cancelled, or the new time is no longer available (409).
 */
export async function updateMeeting(agencyId: string, meetingId: string, input: MeetingUpdateInput): Promise<Meeting> {
  const headers = await authHeader();
  try {
    const { data } = await api.patch<Meeting>(`/agencies/${agencyId}/meetings/${meetingId}`, input, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to update meeting");
  }
}

/**
 * cancelMeeting
 *
 * Cancels a meeting via `POST /agencies/{agencyId}/meetings/{meetingId}/cancel`.
 *
 * @function cancelMeeting
 * @throws {AuthApiError} - Thrown if not authenticated, already cancelled (409), or not found.
 */
export async function cancelMeeting(agencyId: string, meetingId: string): Promise<Meeting> {
  const headers = await authHeader();
  try {
    const { data } = await api.post<Meeting>(`/agencies/${agencyId}/meetings/${meetingId}/cancel`, null, {
      headers,
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to cancel meeting");
  }
}

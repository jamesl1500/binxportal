/**
 * activity.ts
 *
 * Server-only helpers for binx-api's activity-log endpoints:
 * `GET /agencies/{agencyId}/activity` (the agency-wide audit feed, visibility
 * filtered by the caller's role server-side) and `GET /activity/me` (the
 * caller's own security history). Read-only — the log is append-only and
 * written by producers across the backend, never from the client.
 *
 * @module apps/binx-web/src/lib/activity.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { ActivityCategory } from "@/lib/activity-client";

export type { ActivityCategory } from "@/lib/activity-client";
export { ACTIVITY_CATEGORY_META, AGENCY_ACTIVITY_CATEGORIES } from "@/lib/activity-client";

export type ActivityEntry = Omit<Schemas["ActivityLogRead"], "category" | "visibility"> & {
  category: ActivityCategory;
  visibility: "team" | "admin";
};

export type ActivityPage = Omit<Schemas["ActivityLogListRead"], "items"> & { items: ActivityEntry[] };

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

export interface ActivityQuery {
  category?: Exclude<ActivityCategory, "security">;
  limit?: number;
  offset?: number;
}

/**
 * getAgencyActivity
 *
 * A page of an agency's activity feed via `GET /agencies/{agencyId}/activity`.
 * binx-api trims admin-only entries for non-admin callers, so this is safe to
 * call for any member.
 *
 * @function getAgencyActivity
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getAgencyActivity(agencyId: string, query: ActivityQuery = {}): Promise<ActivityPage> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ActivityPage>(`/agencies/${agencyId}/activity`, {
      headers,
      params: { category: query.category, limit: query.limit, offset: query.offset },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load activity");
  }
}

/**
 * getMyActivity
 *
 * The signed-in user's own security history (sign-ins, password/email
 * changes) via `GET /activity/me`.
 *
 * @function getMyActivity
 * @throws {AuthApiError} - Thrown if not authenticated.
 */
export async function getMyActivity(query: { limit?: number; offset?: number } = {}): Promise<ActivityPage> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<ActivityPage>("/activity/me", {
      headers,
      params: { limit: query.limit, offset: query.offset },
    });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load your security activity");
  }
}

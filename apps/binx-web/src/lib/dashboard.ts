/**
 * dashboard.ts
 *
 * Server-only helpers for the team dashboard's aggregation endpoints:
 * `GET /agencies/{id}/dashboard` (the Overview tab's single-request rollup —
 * project/client counts, invoice summary, overdue invoices, recent activity,
 * unread messages, and my work, all in one call) and `GET /agencies/{id}/my-work`
 * (the fuller My Work tab, used on its own page).
 *
 * @module apps/binx-web/src/lib/dashboard.ts
 * @author Binx.io
 */
import axios from "axios";

import { api } from "@/lib/api";
import type { ActivityEntry } from "@/lib/activity";
import type { Schemas } from "@/lib/api-types";
import { AuthApiError, extractDetailMessage, getAccessToken } from "@/lib/auth";
import type { Invoice } from "@/lib/invoicing";
import type { Project } from "@/lib/projects";

export type MyTask = Schemas["MyTaskRead"];
export type MyWork = Schemas["MyWorkRead"];

export type DashboardOverview = Omit<
  Schemas["DashboardRead"],
  "on_hold_projects" | "overdue_invoices" | "recent_activity"
> & {
  on_hold_projects: Project[];
  overdue_invoices: Invoice[];
  recent_activity: ActivityEntry[];
};

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

/**
 * getDashboard
 *
 * The Overview tab's single-request rollup via `GET /agencies/{agencyId}/dashboard`
 * — replaces what used to be 7 separate calls.
 *
 * @function getDashboard
 * @throws {AuthApiError} - Thrown if not authenticated, or the caller isn't a member of this agency.
 */
export async function getDashboard(agencyId: string): Promise<DashboardOverview> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<DashboardOverview>(`/agencies/${agencyId}/dashboard`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load the dashboard");
  }
}

export async function getMyWork(agencyId: string): Promise<MyWork> {
  const headers = await authHeader();
  try {
    const { data } = await api.get<MyWork>(`/agencies/${agencyId}/my-work`, { headers });
    return data;
  } catch (error) {
    throw apiError(error, "Unable to load your work");
  }
}

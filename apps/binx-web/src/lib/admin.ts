/**
 * admin.ts
 *
 * Server-only helpers for the Binx team's console (`/admin`): the platform
 * overview from binx-api's `GET /admin/overview` (platform admins only).
 * The feedback inbox has its own helpers in `lib/feedback.ts`.
 *
 * @module apps/binx-web/src/lib/admin.ts
 * @author Binx Portal
 */

import { api } from "@/lib/api";
import { apiErrorFrom, AuthApiError, getAccessToken } from "@/lib/auth";
import type {
  AdminAgencyRow,
  AdminUserRow,
  AuditEntry,
  UserFilter,
} from "@/lib/admin-client";

export type {
  AdminAgencyRow,
  AdminUserRow,
  AuditEntry,
  UserFilter,
} from "@/lib/admin-client";

export interface PlanMixRow {
  key: string;
  name: string;
  agencies: number;
  trialing: number;
}

export interface WeeklySignups {
  /** Monday of the week, `YYYY-MM-DD` (UTC). */
  week_start: string;
  agencies: number;
  users: number;
}

export interface RecentAgency {
  id: string;
  name: string;
  created_at: string | null;
  plan: string;
  plan_name: string;
  trialing: boolean;
  owner_name: string | null;
  owner_email: string | null;
  members: number;
  clients: number;
}

export interface PlatformOverview {
  agencies_total: number;
  agencies_new_7d: number;
  agencies_new_30d: number;
  users_total: number;
  users_new_7d: number;
  staff_users: number;
  portal_users: number;
  clients_total: number;
  projects_active: number;
  paying_agencies: number;
  mrr_cents: number;
  trialing_agencies: number;
  plan_mix: PlanMixRow[];
  signups_by_week: WeeklySignups[];
  recent_agencies: RecentAgency[];
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  try {
    const { data } = await api.get<PlatformOverview>("/admin/overview", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data;
  } catch (error) {
    throw apiErrorFrom(error, "Unable to load the overview");
  }
}

/** "Nov 10" for a `YYYY-MM-DD` week start — parsed as UTC so it never
 * shifts a day in a western timezone. */
export function weekLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ---- Support tooling --------------------------------------------------------

export interface Page<T> {
  items: T[];
  total: number;
}

export interface AdminSubscription {
  plan: string;
  plan_name: string;
  effective_plan: string;
  status: string;
  trial_plan: string | null;
  trial_ends_at: string | null;
  trialing: boolean;
  has_used_trial: boolean;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export interface AdminActivity {
  id: string;
  category: string;
  event_type: string;
  summary: string;
  actor_name: string | null;
  created_at: string | null;
}

export interface AdminAgencyDetail extends AdminAgencyRow {
  subscription: AdminSubscription;
  team: {
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    title: string | null;
    is_active: boolean;
    joined_at: string | null;
  }[];
  client_list: {
    id: string;
    name: string;
    portal_contacts: number;
    created_at: string | null;
  }[];
  projects_total: number;
  open_feedback: number;
  activity: AdminActivity[];
  audit: AuditEntry[];
}

export interface AdminUserDetail extends AdminUserRow {
  phone_number: string | null;
  job_title: string | null;
  memberships: {
    agency_id: string;
    agency_name: string;
    role: string;
    joined_at: string | null;
  }[];
  portals_list: {
    agency_id: string;
    agency_name: string;
    client_id: string;
    client_name: string;
  }[];
  security: AdminActivity[];
  feedback: {
    id: string;
    kind: string;
    status: string;
    message: string;
    created_at: string | null;
  }[];
  audit: AuditEntry[];
  active_sessions: number;
}

export interface AgencyFilter {
  q?: string;
  plan?: string;
  trialing?: boolean;
  offset?: number;
}

async function adminHeaders(): Promise<{ Authorization: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new AuthApiError("Not authenticated", 401);
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function rethrowAdmin(error: unknown, fallback: string): never {
  throw apiErrorFrom(error, fallback);
}

async function adminGet<T>(
  path: string,
  fallback: string,
  params?: Record<string, string | number | boolean>,
): Promise<T> {
  try {
    const { data } = await api.get<T>(path, {
      headers: await adminHeaders(),
      ...(params ? { params } : {}),
    });
    return data;
  } catch (error) {
    rethrowAdmin(error, fallback);
  }
}

async function adminWrite<T>(
  method: "post" | "put",
  path: string,
  body: unknown,
  fallback: string,
): Promise<T> {
  try {
    const { data } = await api[method]<T>(path, body, {
      headers: await adminHeaders(),
    });
    return data;
  } catch (error) {
    rethrowAdmin(error, fallback);
  }
}

const id = encodeURIComponent;
export const ADMIN_PAGE_SIZE = 25;

export function adminSearch(
  q: string,
): Promise<{ agencies: AdminAgencyRow[]; users: AdminUserRow[] }> {
  return adminGet("/admin/search", "Search failed", { q });
}

export function getAdminAgencies(
  filter: AgencyFilter = {},
): Promise<Page<AdminAgencyRow>> {
  const params: Record<string, string | number | boolean> = {
    limit: ADMIN_PAGE_SIZE,
  };
  if (filter.q?.trim()) params.q = filter.q.trim();
  if (filter.plan) params.plan = filter.plan;
  if (filter.trialing !== undefined) params.trialing = filter.trialing;
  if (filter.offset) params.offset = filter.offset;
  return adminGet("/admin/agencies", "Unable to load agencies", params);
}

export function getAdminAgency(agencyId: string): Promise<AdminAgencyDetail> {
  return adminGet(
    `/admin/agencies/${id(agencyId)}`,
    "Unable to load the agency",
  );
}

export function getAdminUsers(
  filter: { q?: string; filter?: UserFilter; offset?: number } = {},
): Promise<Page<AdminUserRow>> {
  const params: Record<string, string | number> = { limit: ADMIN_PAGE_SIZE };
  if (filter.q?.trim()) params.q = filter.q.trim();
  if (filter.filter) params.filter = filter.filter;
  if (filter.offset) params.offset = filter.offset;
  return adminGet("/admin/users", "Unable to load users", params);
}

export function getAdminUser(userId: string): Promise<AdminUserDetail> {
  return adminGet(`/admin/users/${id(userId)}`, "Unable to load the user");
}

export function getAdminAudit(
  filter: { offset?: number; targetType?: "user" | "agency" } = {},
): Promise<Page<AuditEntry>> {
  const params: Record<string, string | number> = { limit: 50 };
  if (filter.offset) params.offset = filter.offset;
  if (filter.targetType) params.target_type = filter.targetType;
  return adminGet("/admin/audit", "Unable to load the audit log", params);
}

type ActionResult = { message: string };

export function grantTrial(
  agencyId: string,
  input: { plan: string; days: number; reason?: string },
): Promise<ActionResult> {
  return adminWrite(
    "post",
    `/admin/agencies/${id(agencyId)}/trial`,
    { plan: input.plan, days: input.days, reason: input.reason || null },
    "Unable to update the trial",
  );
}

export function endTrial(agencyId: string): Promise<ActionResult> {
  return adminWrite(
    "post",
    `/admin/agencies/${id(agencyId)}/trial/end`,
    null,
    "Unable to end the trial",
  );
}

export function addAdminNote(
  target: "user" | "agency",
  targetId: string,
  body: string,
): Promise<AuditEntry> {
  const base = target === "user" ? "users" : "agencies";
  return adminWrite(
    "post",
    `/admin/${base}/${id(targetId)}/notes`,
    { body },
    "Unable to save the note",
  );
}

export type UserAction =
  | "password-reset"
  | "resend-verification"
  | "verify"
  | "sign-out"
  | "deactivate"
  | "reactivate"
  | "make-admin"
  | "remove-admin";

export function runUserAction(
  userId: string,
  action: UserAction,
  reason?: string,
): Promise<ActionResult> {
  const base = `/admin/users/${id(userId)}`;
  switch (action) {
    case "make-admin":
    case "remove-admin":
      return adminWrite(
        "put",
        `${base}/role`,
        { role: action === "make-admin" ? "admin" : "user" },
        "Unable to change the role",
      );
    case "deactivate":
      return adminWrite(
        "post",
        `${base}/deactivate`,
        { reason: reason || null },
        "Unable to deactivate the account",
      );
    default:
      return adminWrite("post", `${base}/${action}`, null, "That didn't work");
  }
}

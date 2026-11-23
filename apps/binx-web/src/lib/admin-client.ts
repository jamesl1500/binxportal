/**
 * admin-client.ts
 *
 * Client-safe types and labels for the Binx team's console — shared by the
 * server pages and the interactive pieces (trial form, account actions,
 * notes). Server-only fetchers live in `lib/admin.ts`.
 *
 * @module apps/binx-web/src/lib/admin-client.ts
 * @author Binx Portal
 */

export interface AdminAgencyRow {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  created_at: string | null;
  plan: string;
  plan_name: string;
  trialing: boolean;
  subscription_status: string | null;
  owner_name: string | null;
  owner_email: string | null;
  members: number;
  clients: number;
  active_projects: number;
  deletion_scheduled_for?: string | null;
}

export interface AdminUserRow {
  id: string;
  full_name: string;
  email: string;
  user_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string | null;
  last_login_at: string | null;
  agencies: number;
  portals: number;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target_type: "user" | "agency";
  target_id: string;
  target_label: string;
  detail: string | null;
  created_at: string;
}

export type UserFilter =
  "active" | "inactive" | "unverified" | "admin" | "staff" | "portal";

export const USER_FILTERS: { value: UserFilter | undefined; label: string }[] =
  [
    { value: undefined, label: "Everyone" },
    { value: "staff", label: "Agency staff" },
    { value: "portal", label: "Portal clients" },
    { value: "unverified", label: "Unverified" },
    { value: "inactive", label: "Deactivated" },
    { value: "admin", label: "Binx admins" },
  ];

export const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "scale", label: "Scale" },
] as const;

/** Plans support can put an agency on trial for (never Free). */
export const TRIAL_PLAN_OPTIONS = PLAN_OPTIONS.filter(
  (p) => p.value !== "free",
);

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  note: "Note",
  password_reset_sent: "Password reset sent",
  verification_resent: "Verification resent",
  marked_verified: "Marked verified",
  signed_out_everywhere: "Signed out everywhere",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
  role_changed: "Role changed",
  trial_granted: "Trial granted",
  trial_ended: "Trial ended",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

/** Where an audit entry's target lives in the console. */
export function auditTargetHref(
  entry: Pick<AuditEntry, "target_type" | "target_id">,
): string {
  return entry.target_type === "agency"
    ? `/admin/agencies/${entry.target_id}`
    : `/admin/users/${entry.target_id}`;
}

/** A URL query from a filter object, dropping empty values. */
export function adminHref(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === 0)
      continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Untrusted `?offset=` → a non-negative integer. */
export function parseOffset(raw: string | undefined): number {
  return Math.max(0, Number.parseInt(raw ?? "0", 10) || 0);
}

/**
 * billing-client.ts
 *
 * Client-safe constants for the subscription plans: the tier order and a
 * price formatter. No `next/headers`, so Client Components (the plan cards,
 * the usage bars) can import this directly — sibling to `lib/ai-client.ts`.
 *
 * Keep `PLAN_ORDER` in sync with binx-api's billing/models.py::PLAN_ORDER.
 *
 * @module apps/binx-web/src/lib/billing-client.ts
 * @author Binx.io
 */

export type PlanKey = "free" | "starter" | "pro" | "scale";

export const PLAN_ORDER: PlanKey[] = ["free", "starter", "pro", "scale"];

export interface PlanLimits {
  key: string;
  name: string;
  price_cents_month: number;
  max_owned_agencies: number | null;
  max_clients: number | null;
  max_active_projects: number | null;
  max_leads: number | null;
  max_team_members: number | null;
  ai_monthly_budget_cents: number;
  ai_daily_user_cap: number;
}

export function formatPlanPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${Math.round(cents / 100)}/mo`;
}

/** A limit for display: `null` (unlimited) renders as an infinity sign. */
export function formatLimit(value: number | null): string {
  return value === null ? "∞" : value.toLocaleString();
}

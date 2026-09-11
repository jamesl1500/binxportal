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

import type { Schemas } from "@/lib/api-types";

export type PlanKey = "free" | "starter" | "pro" | "scale";

export const PLAN_ORDER: PlanKey[] = ["free", "starter", "pro", "scale"];

export type PlanLimits = Schemas["PlanLimitsRead"];

export function formatPlanPrice(cents: number): string {
  if (cents === 0) return "Free";
  return `$${Math.round(cents / 100)}/mo`;
}

/** A limit for display: `null` (unlimited) renders as an infinity sign. */
export function formatLimit(value: number | null): string {
  return value === null ? "∞" : value.toLocaleString();
}

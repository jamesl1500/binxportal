/**
 * actions.ts - Agency Settings · Plan
 *
 * Server actions for the Plan page. `changePlanAction` is the original
 * direct-switch mutation — binx-api only accepts it now for an agency that's
 * never had a Stripe subscription (see billing/service.py::change_plan's
 * guard), so it's effectively the no-Stripe-configured dev/local path.
 * `startPlanCheckoutAction`/`openBillingPortalAction` are the real ones:
 * they return a Stripe-hosted URL for the browser to navigate to.
 *
 * @module apps/binx-web/src/app/(app)/settings/plan/actions.ts
 * @author Binx.io
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { type Subscription, changePlan, createBillingPortalSession, createPlanCheckout } from "@/lib/billing";

export interface ChangePlanActionResult {
  error?: string;
  subscription?: Subscription;
}

export async function changePlanAction(agencyId: string, plan: string): Promise<ChangePlanActionResult> {
  try {
    const subscription = await changePlan(agencyId, plan);
    revalidatePath("/settings/plan");
    return { subscription };
  } catch (error) {
    return { error: error instanceof AuthApiError ? error.message : "Unable to change the plan" };
  }
}

export interface RedirectActionResult {
  error?: string;
  redirectUrl?: string;
}

export async function startPlanCheckoutAction(agencyId: string, plan: string): Promise<RedirectActionResult> {
  try {
    const redirectUrl = await createPlanCheckout(agencyId, plan);
    return { redirectUrl };
  } catch (error) {
    return { error: error instanceof AuthApiError ? error.message : "Unable to start checkout" };
  }
}

export async function openBillingPortalAction(agencyId: string, targetPlan?: string): Promise<RedirectActionResult> {
  try {
    const redirectUrl = await createBillingPortalSession(agencyId, targetPlan);
    return { redirectUrl };
  } catch (error) {
    return { error: error instanceof AuthApiError ? error.message : "Unable to open the billing portal" };
  }
}

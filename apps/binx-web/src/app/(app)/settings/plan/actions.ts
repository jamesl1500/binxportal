/**
 * actions.ts - Agency Settings · Plan
 *
 * Server action for switching the agency's subscription plan. binx-api
 * independently re-checks that the caller is the agency owner (billing/router
 * OwnerOnly), so this is a plain authenticated mutation.
 *
 * @module apps/binx-web/src/app/(app)/settings/plan/actions.ts
 * @author Binx.io
 */
"use server";

import { revalidatePath } from "next/cache";

import { AuthApiError } from "@/lib/auth";
import { type Subscription, changePlan } from "@/lib/billing";

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

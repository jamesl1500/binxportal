/**
 * actions.ts - Settings → Payouts
 *
 * Mints the single-use client secret Stripe's embedded Payouts component
 * asks for (each time it asks: they expire within minutes).
 *
 * @module apps/binx-web/src/app/(app)/settings/payouts/actions.ts
 * @author Binx Portal
 */
"use server";

import { AuthApiError } from "@/lib/auth";
import { startStripePayoutsSession } from "@/lib/invoicing";

export interface PayoutsSessionResult {
  error?: string;
  clientSecret?: string;
  publishableKey?: string;
}

export async function startPayoutsSessionAction(agencyId: string): Promise<PayoutsSessionResult> {
  try {
    const session = await startStripePayoutsSession(agencyId);
    return { clientSecret: session.client_secret, publishableKey: session.publishable_key };
  } catch (error) {
    return { error: error instanceof AuthApiError ? error.message : "Unable to open your payouts" };
  }
}

/**
 * actions.ts - Onboarding Step Two
 *
 * Server action for creating the user's agency in onboarding step two; plan
 * selection follows. It makes the new agency the "current" one, because every
 * later step (plan, imports, Stripe) acts on the current agency.
 *
 * @module apps/binx-web/src/app/(auth)/onboarding/two/actions.ts
 * @author Binx Portal
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError } from "@/lib/auth";
import { createAgency, setCurrentAgencyId } from "@/lib/agencies";

export interface CreateAgencyActionResult {
  error?: string;
}

export async function createAgencyAction(
  name: string,
): Promise<CreateAgencyActionResult> {
  try {
    const agency = await createAgency(name);
    await setCurrentAgencyId(agency.id);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to create your agency" };
  }

  redirect("/onboarding/three");
}

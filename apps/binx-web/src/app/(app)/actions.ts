/**
 * actions.ts - App Shell
 *
 * Server actions shared across the authenticated app area.
 *
 * @module apps/binx-web/src/app/(app)/actions.ts
 * @author Binx.io
 */
"use server";

import { redirect } from "next/navigation";

import { AuthApiError, logout } from "@/lib/auth";
import { AgencyRead, createAgency, getMyAgencies, setCurrentAgencyId } from "@/lib/agencies";
import { TutorialProgress, updateTutorialProgress } from "@/lib/users";

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/auth/login");
}

export interface SwitchAgencyActionResult {
  error?: string;
}

/**
 * switchAgencyAction
 *
 * Sets the "current agency" cookie so the rest of the app treats the given
 * agency as the one the user is working in. Re-checks membership against
 * binx-api first — the switcher only ever offers agencies the user actually
 * belongs to, but this guards against a stale client or a tampered call.
 * Doesn't redirect; the caller (OrgSwitcher) refreshes the current route
 * instead, so switching orgs doesn't move you elsewhere in the app.
 */
export async function switchAgencyAction(agencyId: string): Promise<SwitchAgencyActionResult> {
  const agencies = await getMyAgencies();
  if (!agencies.some((agency) => agency.id === agencyId)) {
    return { error: "You're not a member of that organization" };
  }

  await setCurrentAgencyId(agencyId);
  return {};
}

export interface CreateAgencyActionResult {
  error?: string;
  agency?: AgencyRead;
}

/**
 * createAgencyAction
 *
 * Creates a new agency (the caller becomes its owner) and immediately makes
 * it the "current agency", since having just created it you're almost
 * certainly about to work in it. Unlike onboarding's createAgencyAction,
 * this doesn't redirect — it's called from the dedicated `/agencies/new`
 * page (reachable from the org switcher), and the caller (NewAgencyForm)
 * navigates to the dashboard itself instead.
 */
export async function createAgencyAction(name: string): Promise<CreateAgencyActionResult> {
  let agency: AgencyRead;
  try {
    agency = await createAgency(name);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to create your agency" };
  }

  await setCurrentAgencyId(agency.id);
  return { agency };
}

export interface UpdateTutorialProgressActionResult {
  error?: string;
}

/**
 * updateTutorialProgressAction
 *
 * Persists the welcome tour's completed/skipped state and which page
 * popups have been dismissed. Called by TutorialProvider in the
 * background — a failed save just means the hint reappears next load, an
 * acceptable, low-stakes failure mode, so callers don't need to surface
 * this error to the user.
 */
export async function updateTutorialProgressAction(
  progress: TutorialProgress,
): Promise<UpdateTutorialProgressActionResult> {
  try {
    await updateTutorialProgress(progress);
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to save tutorial progress" };
  }
  return {};
}

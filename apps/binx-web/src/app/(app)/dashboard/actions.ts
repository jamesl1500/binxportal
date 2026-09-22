/**
 * actions.ts - Dashboard
 *
 * Server actions behind the dashboard's AI briefing card and its
 * customizable widget grid. Kept separate from settings/actions.ts because
 * these are plain, no-cookie-changing calls scoped to this page, not
 * account-settings mutations.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/actions.ts
 * @author Binx.io
 */
"use server";

import { getAiBriefing } from "@/lib/ai";
import { AuthApiError } from "@/lib/auth";
import { type DashboardLayout, updateDashboardLayout } from "@/lib/users";

export interface AiBriefingActionResult {
  error?: string;
  notConfigured?: boolean;
  briefing?: string;
}

export async function getAiBriefingAction(agencyId: string, force = false): Promise<AiBriefingActionResult> {
  try {
    return { briefing: await getAiBriefing(agencyId, force) };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message, notConfigured: error.status === 503 };
    }
    return { error: "Unable to generate a briefing" };
  }
}

export interface DashboardLayoutActionResult {
  error?: string;
  layout?: DashboardLayout;
}

export async function updateDashboardLayoutAction(
  widgetOrder: string[],
  hiddenWidgets: string[],
): Promise<DashboardLayoutActionResult> {
  try {
    return { layout: await updateDashboardLayout(widgetOrder, hiddenWidgets) };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to save your dashboard layout" };
  }
}

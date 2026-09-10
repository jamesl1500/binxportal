/**
 * Confirm Email Change Actions
 *
 * Server action for confirming a pending email change from the link sent to
 * the new address. Unlike verify-email's action, this doesn't establish a
 * session — binx-api's /auth/confirm-email endpoint doesn't issue tokens —
 * so it calls the shared lib/auth.ts helper directly rather than going
 * through an internal `/api/*` proxy route.
 *
 * @module apps/binx-web/src/app/(auth)/auth/confirm-email/actions.ts
 * @author Binx.io
 */
"use server";

import { AuthApiError, confirmEmailChange } from "@/lib/auth";

export interface ConfirmEmailChangeActionResult {
  error?: string;
  message?: string;
}

export async function confirmEmailChangeAction(token: string): Promise<ConfirmEmailChangeActionResult> {
  try {
    const message = await confirmEmailChange(token);
    return { message };
  } catch (error) {
    if (error instanceof AuthApiError) {
      return { error: error.message };
    }
    return { error: "Unable to confirm email change" };
  }
}

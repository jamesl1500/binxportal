/**
 * actions.ts - Reset Password
 *
 * Server action that exchanges a reset token + new password by calling the
 * internal reset-password API route.
 *
 * @module apps/binx-web/src/app/(auth)/auth/reset-password/actions.ts
 * @author Binx.io
 * @function resetPasswordAction - Server action to reset a password.
 */

"use server";

import axios from "axios";

import { getInternalBaseUrl } from "@/lib/auth";

export interface ResetPasswordActionResult {
  error?: string;
  message?: string;
}

export async function resetPasswordAction(token: string, newPassword: string): Promise<ResetPasswordActionResult> {
  const baseUrl = await getInternalBaseUrl();

  try {
    const response = await axios.post(`${baseUrl}/api/auth/reset-password`, { token, newPassword });
    return { message: response.data?.message ?? "Password reset successfully." };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return { error: (error.response.data as { message?: string })?.message ?? "Unable to reset password" };
    }
    return { error: "Unable to reset password" };
  }
}

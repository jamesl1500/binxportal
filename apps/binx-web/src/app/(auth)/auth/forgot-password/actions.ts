/**
 * actions.ts - Forgot Password
 *
 * Server action that requests a password-reset email by calling the internal
 * forgot-password API route.
 *
 * @module apps/binx-web/src/app/(auth)/auth/forgot-password/actions.ts
 * @author Binx.io
 * @function forgotPasswordAction - Server action to request a password reset.
 */

"use server";

import axios from "axios";

import { getInternalBaseUrl } from "@/lib/auth";

export interface ForgotPasswordActionResult {
  error?: string;
  message?: string;
}

export async function forgotPasswordAction(email: string): Promise<ForgotPasswordActionResult> {
  const baseUrl = await getInternalBaseUrl();

  try {
    const response = await axios.post(`${baseUrl}/api/auth/forgot-password`, { email });
    return { message: response.data?.message ?? "If that account exists, a reset link has been sent." };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return { error: (error.response.data as { message?: string })?.message ?? "Unable to process your request" };
    }
    return { error: "Unable to process your request" };
  }
}

/**
 * Verify Email Actions
 *
 * This module contains the server action for verifying a user's email address. It handles the form submission from the VerifyEmailForm component, validates the input, and performs the necessary server-side logic to verify the email — then, on success, signs the user in and sends them into onboarding.
 *
 * @module apps/binx-web/src/app/(auth)/auth/verify-email/actions.ts
 * @author Binx.io
 */

"use server";

import axios from "axios";
import { redirect } from "next/navigation";

import { forwardSetCookies, getInternalBaseUrl } from "@/lib/auth";

/**
 * VerifyEmailActionResult
 *
 * Represents the result of the verify email action, including any error message.
 * @interface VerifyEmailActionResult
 */
export interface VerifyEmailActionResult {
  error?: string;
}

/**
 * verifyEmailAction
 *
 * Server action to verify a user's email address. It sends a POST request to
 * the internal verify-email API route, forwards the session cookies binx-api
 * issues on success, and sends the now-signed-in user into onboarding.
 *
 * @param {string} token - The verification token sent to the user's email.
 * @returns {Promise<VerifyEmailActionResult>} The result of the verify email action.
 */
export async function verifyEmailAction(token: string): Promise<VerifyEmailActionResult> {
  const baseUrl = await getInternalBaseUrl();

  try {
    const response = await axios.post(`${baseUrl}/api/auth/verify-email`, { token });
    await forwardSetCookies(response.headers["set-cookie"]);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return { error: (error.response.data as { message?: string })?.message ?? "Unable to verify email" };
    }
    return { error: "Unable to verify email" };
  }

  redirect("/onboarding/one");
}
/**
 * actions.ts - Signup
 * 
 * This file defines the server action for user signup in the Binx Web application.
 * It handles the account creation process by sending a POST request to the internal
 * signup API route and returning any error or success messages.
 * 
 * @module apps/binx-web/src/app/(auth)/auth/signup/actions.ts
 * @author Binx.io
 * @function signupAction - Server action for user signup.
 */

"use server";

import axios from "axios";

import { getInternalBaseUrl } from "@/lib/auth";

/**
 * SignupActionResult
 * 
 * Represents the result of the signup action, including any error or success messages.
 * 
 * @interface SignupActionResult
 */
export interface SignupActionResult {
  error?: string;
  message?: string;
}

export async function signupAction(
  userName: string,
  email: string,
  fullName: string,
  password: string,
): Promise<SignupActionResult> {
  const baseUrl = await getInternalBaseUrl();

  try {
    const response = await axios.post(`${baseUrl}/api/auth/signup`, { userName, email, fullName, password });
    return { message: response.data?.message ?? "Account created. Check your email to verify your address." };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return { error: (error.response.data as { message?: string })?.message ?? "Unable to create account" };
    }
    return { error: "Unable to create account" };
  }
}

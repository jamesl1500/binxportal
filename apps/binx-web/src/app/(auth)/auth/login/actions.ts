/**
 * actions.ts - Login
 * 
 * This file defines the server action for user login in the Binx Web application.
 * It handles the authentication process by sending a POST request to the internal
 * login API route and forwarding any `Set-Cookie` headers to the current request's
 * 
 * @module apps/binx-web/src/app/(auth)/auth/login/actions.ts
 * @author Binx.io
 * @function loginAction - Server action for user login.
 */

"use server";

import axios from "axios";
import { redirect } from "next/navigation";

import { forwardSetCookies, getInternalBaseUrl } from "@/lib/auth";
import { resolveHome } from "@/lib/portal";

/**
 * LoginActionResult
 * 
 * Represents the result of the login action, including any error messages.
 * 
 * @interface LoginActionResult
 */
export interface LoginActionResult {
  error?: string;
  /**
   * Set (to the attempted email) only when the failure was specifically an
   * unverified account — binx-api's login() raises this exact message for
   * that case (see modules/auth/service.py) — so LoginForm can offer to
   * resend the verification email instead of just showing a dead-end error.
   */
  unverifiedEmail?: string;
}

export async function loginAction(email: string, password: string): Promise<LoginActionResult> {
  const baseUrl = await getInternalBaseUrl();

  try {
    const response = await axios.post(`${baseUrl}/api/auth/login`, { email, password });
    await forwardSetCookies(response.headers["set-cookie"]);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const message = (error.response.data as { message?: string })?.message ?? "Unable to sign in";
      return message === "Email not verified" ? { error: message, unverifiedEmail: email } : { error: message };
    }
    return { error: "Unable to sign in" };
  }

  // Staff land on the dashboard, client contacts on the portal.
  redirect(await resolveHome());
}

export interface ResendVerificationActionResult {
  error?: string;
  message?: string;
}

export async function resendVerificationAction(email: string): Promise<ResendVerificationActionResult> {
  const baseUrl = await getInternalBaseUrl();

  try {
    const response = await axios.post(`${baseUrl}/api/auth/resend-verification`, { email });
    return { message: response.data?.message ?? "If that account exists, a verification email has been sent." };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return { error: (error.response.data as { message?: string })?.message ?? "Unable to process your request" };
    }
    return { error: "Unable to process your request" };
  }
}

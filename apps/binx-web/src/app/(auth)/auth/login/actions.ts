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

/**
 * LoginActionResult
 * 
 * Represents the result of the login action, including any error messages.
 * 
 * @interface LoginActionResult
 */
export interface LoginActionResult {
  error?: string;
}

export async function loginAction(email: string, password: string): Promise<LoginActionResult> {
  const baseUrl = await getInternalBaseUrl();

  try {
    const response = await axios.post(`${baseUrl}/api/auth/login`, { email, password });
    await forwardSetCookies(response.headers["set-cookie"]);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return { error: (error.response.data as { message?: string })?.message ?? "Unable to sign in" };
    }
    return { error: "Unable to sign in" };
  }

  redirect("/dashboard");
}

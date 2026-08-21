/**
 * route.ts - Auth
 * 
 * This file defines the API route for user login in the Binx Web application.
 * It handles POST requests to authenticate users by validating their 
 * credentials against the binx-api. Upon successful authentication, 
 * it sets the access and refresh tokens in cookies for session management
 * 
 * @module apps/binx-web/src/app/api/auth/login/route.ts
 * @author Binx.io
 * @route POST /api/auth/login
 * @returns {Promise<Response>} - A response indicating the result of the login attempt.
 */
import { NextRequest, NextResponse } from "next/server";

import { AuthApiError, login } from "@/lib/auth";

/**
 * POST /api/auth/login
 *
 * Handles user login by validating credentials against the binx-api.
 * If successful, sets access and refresh tokens in cookies for session management.
 * 
 * @async
 * @function POST
 * @param {NextRequest} req - The incoming request object containing user credentials.
 * @returns {Promise<NextResponse>} - A response indicating the result of the login attempt.
 */
export async function POST(req: NextRequest) {
  let email: string | undefined;
  let password: string | undefined;

  try {
    ({ email, password } = await req.json());
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
  }

  try {
    const user = await login(email, password);

    return NextResponse.json({ message: "Login successful", user }, { status: 200 });
  } catch (error) {
    // Propagate the upstream binx-api status (401 bad credentials, 403 unverified, etc.)
    // instead of masking every failure as 401.
    if (error instanceof AuthApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: "Login failed", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
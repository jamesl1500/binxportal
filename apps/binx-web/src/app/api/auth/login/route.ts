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

import { login } from "@/lib/auth";

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
  const { email, password } = await req.json();

  try {
    const user = await login(email, password);
    
    if(!user) {
      return NextResponse.json(
        { message: "Login succeeded but current user could not be fetched" },
        { status: 500 }
      );
    }

    // Return response
    const res = NextResponse.json({ message: "Login successful", user });

    return res;
  } catch (error) {
    return NextResponse.json(
      { message: "Invalid credentials", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 401 }
    );
  }
}
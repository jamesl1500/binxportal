/**
 * route.ts - Forgot Password
 *
 * API route that triggers a password-reset email via binx-api.
 *
 * @module apps/binx-web/src/app/api/auth/forgot-password/route.ts
 * @route POST /api/auth/forgot-password
 */
import { NextRequest, NextResponse } from "next/server";

import { AuthApiError, requestPasswordReset } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let email: string | undefined;

  try {
    ({ email } = await req.json());
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ message: "Email is required" }, { status: 400 });
  }

  try {
    const message = await requestPasswordReset(email);
    return NextResponse.json({ message }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: "Request failed", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

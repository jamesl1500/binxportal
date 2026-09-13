/**
 * route.ts - Resend Verification
 *
 * API route that triggers a fresh account-verification email via binx-api.
 *
 * @module apps/binx-web/src/app/api/auth/resend-verification/route.ts
 * @route POST /api/auth/resend-verification
 */
import { NextRequest, NextResponse } from "next/server";

import { AuthApiError, resendVerification } from "@/lib/auth";

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
    const message = await resendVerification(email);
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

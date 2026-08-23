/**
 * route.ts - Verify Email
 *
 * API route that exchanges an email-verification token for an activated
 * account via binx-api.
 *
 * @module apps/binx-web/src/app/api/auth/verify-email/route.ts
 * @route POST /api/auth/verify-email
 */
import { NextRequest, NextResponse } from "next/server";

import { AuthApiError, verifyEmail } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let token: string | undefined;

  try {
    ({ token } = await req.json());
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ message: "Token is required" }, { status: 400 });
  }

  try {
    const message = await verifyEmail(token);
    return NextResponse.json({ message }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: "Verification failed", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

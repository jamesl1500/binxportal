/**
 * route.ts - Reset Password
 *
 * API route that exchanges a password-reset token for a new password via binx-api.
 *
 * @module apps/binx-web/src/app/api/auth/reset-password/route.ts
 * @route POST /api/auth/reset-password
 */
import { NextRequest, NextResponse } from "next/server";

import { AuthApiError, resetPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let token: string | undefined;
  let newPassword: string | undefined;

  try {
    ({ token, newPassword } = await req.json());
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!token || !newPassword) {
    return NextResponse.json({ message: "Token and new password are required" }, { status: 400 });
  }

  try {
    const message = await resetPassword(token, newPassword);
    return NextResponse.json({ message }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: "Reset failed", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

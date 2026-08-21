/**
 * route.ts - Signup
 *
 * API route for account creation. Delegates credential/validation logic to
 * binx-api via `signup()` in lib/auth.ts. No session cookies are set here —
 * binx-api requires email verification before an account can sign in.
 *
 * @module apps/binx-web/src/app/api/auth/signup/route.ts
 * @author Binx.io
 * @route POST /api/auth/signup
 */
import { NextRequest, NextResponse } from "next/server";

import { AuthApiError, signup } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let userName: string | undefined;
  let email: string | undefined;
  let fullName: string | undefined;
  let password: string | undefined;

  try {
    ({ userName, email, fullName, password } = await req.json());
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!userName || !email || !fullName || !password) {
    return NextResponse.json({ message: "All fields are required" }, { status: 400 });
  }

  try {
    const message = await signup({ userName, email, fullName, password });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { message: "Signup failed", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

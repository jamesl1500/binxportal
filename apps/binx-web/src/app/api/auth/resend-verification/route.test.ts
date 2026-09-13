import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake out @/lib/auth so this file only tests the route's own request
// parsing/status-mapping — resendVerification()'s real HTTP call is tested
// on its own in auth.test.ts.
vi.mock("@/lib/auth", () => ({
  resendVerification: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { NextRequest } from "next/server";

import { AuthApiError, resendVerification } from "@/lib/auth";
import { POST } from "./route";

const mockedResendVerification = vi.mocked(resendVerification);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/resend-verification", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/resend-verification", () => {
  it("returns 400 for invalid JSON", async () => {
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Email is required" });
    expect(mockedResendVerification).not.toHaveBeenCalled();
  });

  // This endpoint always returns 200 with the same generic message — even for
  // an email that doesn't exist or is already verified — so an attacker can't
  // use response differences to enumerate which addresses have accounts.
  it("returns 200 with binx-api's generic message", async () => {
    mockedResendVerification.mockResolvedValueOnce("If that account exists, a verification email has been sent.");

    const res = await POST(makeRequest({ email: "a@b.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message: "If that account exists, a verification email has been sent.",
    });
  });

  it("propagates the AuthApiError status", async () => {
    mockedResendVerification.mockRejectedValueOnce(new AuthApiError("Unable to process your request", 422));

    const res = await POST(makeRequest({ email: "not-an-email" }));

    expect(res.status).toBe(422);
  });
});

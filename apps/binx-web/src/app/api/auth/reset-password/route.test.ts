import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake out @/lib/auth so this file only tests the route's own request
// parsing/status-mapping — resetPassword()'s real HTTP call is tested on its
// own in auth.test.ts.
vi.mock("@/lib/auth", () => ({
  resetPassword: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { NextRequest } from "next/server";

import { AuthApiError, resetPassword } from "@/lib/auth";
import { POST } from "./route";

const mockedResetPassword = vi.mocked(resetPassword);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/reset-password", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/reset-password", () => {
  it("returns 400 for invalid JSON", async () => {
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when token or newPassword is missing", async () => {
    const res = await POST(makeRequest({ token: "abc" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Token and new password are required" });
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it("returns 200 with the success message", async () => {
    mockedResetPassword.mockResolvedValueOnce("Password reset successfully.");

    const res = await POST(makeRequest({ token: "abc", newPassword: "newpassword123" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Password reset successfully." });
  });

  // Tokens are single-use/expiring — a reused or garbage token should surface
  // the exact message + status binx-api returned, not a generic failure.
  it("propagates the AuthApiError status for an invalid token", async () => {
    mockedResetPassword.mockRejectedValueOnce(new AuthApiError("Invalid or expired token", 400));

    const res = await POST(makeRequest({ token: "bad", newPassword: "newpassword123" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invalid or expired token" });
  });
});

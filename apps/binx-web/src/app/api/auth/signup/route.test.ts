import { beforeEach, describe, expect, it, vi } from "vitest";

// Same strategy as the login route test: fake out @/lib/auth entirely so we
// exercise only the route's own request-parsing/status-mapping logic, not
// signup()'s real binx-api call (that's covered separately in auth.test.ts).
vi.mock("@/lib/auth", () => ({
  signup: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { NextRequest } from "next/server";

import { AuthApiError, signup } from "@/lib/auth";
import { POST } from "./route";

const mockedSignup = vi.mocked(signup);

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/signup", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/signup", () => {
  it("returns 400 for invalid JSON", async () => {
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
  });

  // userName/email/fullName/password are all required before we even bother
  // calling signup() — asserting it wasn't called proves the short-circuit.
  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "All fields are required" });
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  // Signup uses 201 Created (not 200) since a new resource — the user — was
  // actually created, unlike login which just returns an existing user.
  it("returns 201 with the success message", async () => {
    mockedSignup.mockResolvedValueOnce("Account created. Check your email to verify your address.");

    const res = await POST(
      makeRequest({ userName: "user", email: "a@b.com", fullName: "A B", password: "password123" }),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ message: "Account created. Check your email to verify your address." });
  });

  // binx-api returns 409 Conflict for "this email/username is already taken";
  // the route should pass that status straight through rather than always 400/500.
  it("propagates the AuthApiError status for a duplicate email", async () => {
    mockedSignup.mockRejectedValueOnce(new AuthApiError("Email already registered", 409));

    const res = await POST(
      makeRequest({ userName: "user", email: "a@b.com", fullName: "A B", password: "password123" }),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ message: "Email already registered" });
  });
});

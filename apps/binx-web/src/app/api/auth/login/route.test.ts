import { beforeEach, describe, expect, it, vi } from "vitest";

// We're testing the Route Handler in isolation, not the real login() logic
// (that's already covered by src/lib/auth.test.ts). So we replace the whole
// @/lib/auth module with a fake `login` we fully control, plus a fake
// `AuthApiError` class. It has to be a real `class extends Error` (not just
// an object) so that `error instanceof AuthApiError` inside route.ts still
// works — with vi.mock, the route file and this test file both import THIS
// mocked class, so the identity check lines up.
vi.mock("@/lib/auth", () => ({
  login: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// NextRequest/NextResponse are thin wrappers around the standard Web
// Request/Response objects, so they work outside of a real Next.js server —
// no extra mocking needed to construct one and pass it straight to POST().
import { NextRequest } from "next/server";

import { AuthApiError, login } from "@/lib/auth";
import { POST } from "./route";

const mockedLogin = vi.mocked(login);

/** Builds a fake incoming request the same way the browser/fetch would. */
function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    // Passing a raw string (not JSON.stringify'd) lets us simulate a
    // malformed-body request for the "invalid JSON" test case below.
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/login", () => {
  // route.ts wraps `await req.json()` in its own try/catch, so a body that
  // isn't valid JSON should be caught there and turned into a 400, rather
  // than crashing the route with an unhandled SyntaxError.
  it("returns 400 for invalid JSON", async () => {
    const res = await POST(makeRequest("not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Invalid JSON body" });
  });

  // Cheap validation that happens before we ever call login() — asserting
  // login() was never called proves the route short-circuits instead of
  // wasting a network round-trip to binx-api on obviously-bad input.
  it("returns 400 when email or password is missing", async () => {
    const res = await POST(makeRequest({ email: "a@b.com" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Email and password are required" });
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  // Happy path: login() resolves, so the route should respond 200 with the
  // user tucked inside a `{ message, user }` envelope.
  it("returns 200 with the user on success", async () => {
    mockedLogin.mockResolvedValueOnce({ id: "1", email: "a@b.com" } as never);

    const res = await POST(makeRequest({ email: "a@b.com", password: "password123" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Login successful", user: { id: "1", email: "a@b.com" } });
  });

  // This is the key behavior this route exists to provide: when login()
  // throws an AuthApiError (meaning binx-api rejected the request with a
  // specific status/reason), the route must forward that EXACT status and
  // message to the browser instead of collapsing everything to a generic 401/500.
  it("propagates the AuthApiError status and message", async () => {
    mockedLogin.mockRejectedValueOnce(new AuthApiError("Incorrect email or password", 401));

    const res = await POST(makeRequest({ email: "a@b.com", password: "wrong" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Incorrect email or password" });
  });

  // Anything that ISN'T an AuthApiError (a network error, a bug, etc.) is
  // unexpected, so the route falls back to a generic 500 rather than leaking
  // internals or guessing a status code.
  it("returns 500 for unexpected errors", async () => {
    mockedLogin.mockRejectedValueOnce(new Error("boom"));

    const res = await POST(makeRequest({ email: "a@b.com", password: "password123" }));

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ message: "Login failed", error: "boom" });
  });
});

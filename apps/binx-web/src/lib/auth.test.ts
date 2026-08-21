import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` runs BEFORE the `vi.mock` calls below (and before any imports),
// because Vitest hoists `vi.mock` factories to the very top of the file at
// compile time. If we declared these variables with a normal `const` instead,
// the mock factories wouldn't be able to see them yet ("cannot access before
// initialization"). `vi.hoisted` is the escape hatch for sharing state between
// a mock factory and the test body.
const { mockCookieStore, mockHeaderMap, cookieJar } = vi.hoisted(() => {
  // A plain Map standing in for the real (immutable, async) Next.js cookie
  // store. This lets us both "read" cookies the code under test set, and
  // "seed" cookies before calling a function, without touching a browser.
  const jar = new Map<string, { value: string }>();
  return {
    cookieJar: jar,
    mockCookieStore: {
      get: vi.fn((name: string) => jar.get(name)),
      set: vi.fn((name: string, value: string) => {
        jar.set(name, { value });
      }),
      delete: vi.fn((name: string) => {
        jar.delete(name);
      }),
    },
    // Stand-in for the headers() request-header map, used by getInternalBaseUrl.
    mockHeaderMap: new Map<string, string>(),
  };
});

// `next/headers` only works inside an actual Next.js request (Server
// Component / Route Handler / Server Action). Outside of that runtime it
// throws, so every test that imports lib/auth.ts must replace it with a fake
// that behaves the same way (`cookies()`/`headers()` return promises).
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
  headers: vi.fn(async () => ({
    get: (key: string) => mockHeaderMap.get(key) ?? null,
  })),
}));

// lib/auth.ts talks to binx-api exclusively through this shared axios
// instance. Mocking the whole module means `api.get`/`api.post` become
// `vi.fn()`s we control per-test, so no real HTTP request ever leaves the
// test process.
vi.mock("@/lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from "@/lib/api";
import {
  AuthApiError,
  getCurrentUser,
  getInternalBaseUrl,
  login,
  requestPasswordReset,
  resetPassword,
  signup,
} from "@/lib/auth";

// `vi.mocked` just gives us back the same object with TypeScript types that
// know `.get`/`.post` are mock functions (so `.mockResolvedValueOnce` etc.
// type-check instead of erroring).
const mockedApi = vi.mocked(api, true);

/**
 * Builds a fake error shaped exactly like what axios throws for a non-2xx
 * response. `axios.isAxiosError()` (used inside lib/auth.ts) checks for the
 * `isAxiosError: true` marker plus a `.response` object — as long as we shape
 * our fake the same way, the real `axios.isAxiosError` check treats it as
 * genuine, so we never need to mock the `axios` package itself here.
 */
function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  // Reset call counts/return values on every mock function between tests...
  vi.clearAllMocks();
  // ...and reset our fake "state" (cookies, headers) too, since Maps aren't
  // cleared automatically by vi.clearAllMocks() — they're plain data, not mocks.
  cookieJar.clear();
  mockHeaderMap.clear();
});

describe("getInternalBaseUrl", () => {
  // Behind a reverse proxy / load balancer, the real host/protocol the
  // browser used are carried in x-forwarded-* headers, not `host`.
  it("prefers x-forwarded-host/proto when present", async () => {
    mockHeaderMap.set("x-forwarded-host", "app.example.com");
    mockHeaderMap.set("x-forwarded-proto", "https");

    await expect(getInternalBaseUrl()).resolves.toBe("https://app.example.com");
  });

  // Locally (no proxy in front of `next dev`), only the plain `host` header
  // is available, and we assume http since NODE_ENV isn't "production" in tests.
  it("falls back to host header and http in development", async () => {
    mockHeaderMap.set("host", "localhost:3000");

    await expect(getInternalBaseUrl()).resolves.toBe("http://localhost:3000");
  });
});

describe("getCurrentUser", () => {
  // No cookie means no possible session — this should short-circuit and never
  // even attempt to call binx-api.
  it("returns null when there is no access token cookie", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  // Happy path: a cookie is present, so we expect a GET /users/me call with
  // the token forwarded as a Bearer header, and the resulting user returned as-is.
  it("returns the user when the access token is valid", async () => {
    cookieJar.set("binx_access_token", { value: "valid-token" });
    mockedApi.get.mockResolvedValueOnce({ data: { id: "1", email: "a@b.com" } });

    await expect(getCurrentUser()).resolves.toEqual({ id: "1", email: "a@b.com" });
    expect(mockedApi.get).toHaveBeenCalledWith("/users/me", {
      headers: { Authorization: "Bearer valid-token" },
    });
  });

  // getCurrentUser() intentionally swallows errors and returns null instead of
  // throwing — it's used as a boolean-ish "is the session still valid?" check,
  // e.g. by pages that need to redirect unauthenticated users.
  it("returns null when binx-api rejects the token", async () => {
    cookieJar.set("binx_access_token", { value: "expired-token" });
    mockedApi.get.mockRejectedValueOnce(axiosError(401, "Could not validate credentials"));

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("login", () => {
  // On success, login() does three things worth asserting on: (1) return the
  // user, (2) persist the access token cookie, (3) persist the refresh token
  // cookie. We inspect the shared `cookieJar` directly since that's what our
  // `next/headers` mock writes to under the hood.
  it("sets cookies and returns the current user on success", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { access_token: "at", refresh_token: "rt" } });
    mockedApi.get.mockResolvedValueOnce({ data: { id: "1", email: "a@b.com" } });

    const user = await login("a@b.com", "password123");

    expect(user).toEqual({ id: "1", email: "a@b.com" });
    expect(cookieJar.get("binx_access_token")?.value).toBe("at");
    expect(cookieJar.get("binx_refresh_token")?.value).toBe("rt");
  });

  // binx-api returns a plain-string `detail` field for HTTPException-style
  // errors (401 bad credentials here). login() should re-throw that exact
  // message wrapped in an AuthApiError (which also carries the HTTP status,
  // so the API route handler can forward the same status to the browser).
  it("throws AuthApiError with binx-api's detail message on bad credentials", async () => {
    mockedApi.post.mockRejectedValue(axiosError(401, "Incorrect email or password"));

    await expect(login("a@b.com", "wrong")).rejects.toMatchObject({
      message: "Incorrect email or password",
      status: 401,
    });
    await expect(login("a@b.com", "wrong")).rejects.toBeInstanceOf(AuthApiError);
  });

  // FastAPI/pydantic 422 responses use a different shape: `detail` is an
  // ARRAY of `{ msg, loc, type, ... }` objects, one per invalid field, not a
  // single string. lib/auth.ts's extractDetailMessage() has to detect this
  // and join the individual `msg` values into one readable string.
  it("joins pydantic validation error messages for 422 responses", async () => {
    mockedApi.post.mockRejectedValueOnce(
      axiosError(422, [{ msg: "value is not a valid email address" }, { msg: "field required" }]),
    );

    await expect(login("bad", "")).rejects.toMatchObject({
      message: "value is not a valid email address field required",
      status: 422,
    });
  });
});

describe("signup", () => {
  // Unlike login(), signup() must NOT set any session cookies — binx-api
  // requires email verification before a new account can actually sign in,
  // so there's no token pair to persist yet.
  it("returns the success message without setting cookies", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { message: "Check your email" } });

    await expect(
      signup({ userName: "user", email: "a@b.com", fullName: "A B", password: "password123" }),
    ).resolves.toBe("Check your email");
    expect(cookieJar.size).toBe(0);
  });

  it("throws AuthApiError when the email is already registered", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(409, "Email already registered"));

    await expect(
      signup({ userName: "user", email: "a@b.com", fullName: "A B", password: "password123" }),
    ).rejects.toMatchObject({ message: "Email already registered", status: 409 });
  });
});

describe("requestPasswordReset", () => {
  // binx-api always returns this same generic message whether or not the
  // email actually belongs to an account, to avoid letting an attacker probe
  // which addresses are registered. We just assert we pass that message through untouched.
  it("returns binx-api's generic message", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { message: "If that account exists, a password reset email has been sent." },
    });

    await expect(requestPasswordReset("a@b.com")).resolves.toBe(
      "If that account exists, a password reset email has been sent.",
    );
  });
});

describe("resetPassword", () => {
  it("resolves with the success message", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { message: "Password reset successfully." } });

    await expect(resetPassword("token123", "newpassword123")).resolves.toBe("Password reset successfully.");
  });

  // Reset tokens are single-use and time-limited (see AuthToken/service.py on
  // the backend) — an old/reused/garbage token should surface this specific message.
  it("throws AuthApiError for an invalid or expired token", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(400, "Invalid or expired token"));

    await expect(resetPassword("bad-token", "newpassword123")).rejects.toMatchObject({
      message: "Invalid or expired token",
      status: 400,
    });
  });
});


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
  clearAuthCookies,
  confirmEmailChange,
  forwardSetCookies,
  getCurrentUser,
  getEmailChangeTarget,
  getEmailVerificationTarget,
  getInternalBaseUrl,
  getRefreshToken,
  login,
  logout,
  refreshSession,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  signup,
  verifyEmail,
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
  // A configured origin wins and the (spoofable) host headers are ignored —
  // this is what a real deployment must set.
  it("uses APP_ORIGIN / NEXT_PUBLIC_SITE_URL verbatim, ignoring the host header", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.binx.example/");
    mockHeaderMap.set("x-forwarded-host", "evil.example.com");

    await expect(getInternalBaseUrl()).resolves.toBe("https://app.binx.example");

    vi.unstubAllEnvs();
  });

  // With nothing configured (local dev), fall back to the request headers.
  // Behind a proxy the real host/proto arrive in x-forwarded-*.
  it("prefers x-forwarded-host/proto when nothing is configured", async () => {
    mockHeaderMap.set("x-forwarded-host", "app.example.com");
    mockHeaderMap.set("x-forwarded-proto", "https");

    await expect(getInternalBaseUrl()).resolves.toBe("https://app.example.com");
  });

  it("falls back to the host header and http in development", async () => {
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

describe("resendVerification", () => {
  // Same anti-enumeration shape as requestPasswordReset — binx-api always
  // returns this generic message, whether the email is unregistered, already
  // verified, or genuinely pending. We just pass it through untouched.
  it("returns binx-api's generic message", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { message: "If that account exists, a verification email has been sent." },
    });

    await expect(resendVerification("a@b.com")).resolves.toBe(
      "If that account exists, a verification email has been sent.",
    );
  });

  it("throws AuthApiError when binx-api rejects the request outright", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(422, "Invalid email address"));

    await expect(resendVerification("not-an-email")).rejects.toMatchObject({
      message: "Invalid email address",
      status: 422,
    });
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

describe("getEmailChangeTarget", () => {
  it("resolves with the pending new email address", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { new_email: "new@example.com" } });

    await expect(getEmailChangeTarget("token123")).resolves.toBe("new@example.com");
    expect(mockedApi.get).toHaveBeenCalledWith("/auth/confirm-email", { params: { token: "token123" } });
  });

  it("throws AuthApiError for an invalid or expired token", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(400, "Invalid or expired token"));

    await expect(getEmailChangeTarget("bad-token")).rejects.toMatchObject({
      message: "Invalid or expired token",
      status: 400,
    });
  });
});

describe("confirmEmailChange", () => {
  it("resolves with the success message", async () => {
    mockedApi.post.mockResolvedValueOnce({ data: { message: "Email address updated." } });

    await expect(confirmEmailChange("token123")).resolves.toBe("Email address updated.");
    expect(mockedApi.post).toHaveBeenCalledWith("/auth/confirm-email", { token: "token123" });
  });

  it("throws AuthApiError for an invalid or expired token", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(400, "Invalid or expired token"));

    await expect(confirmEmailChange("bad-token")).rejects.toMatchObject({
      message: "Invalid or expired token",
      status: 400,
    });
  });
});

describe("cookie helpers", () => {
  it("forwardSetCookies copies parsed Set-Cookie headers onto the request jar", async () => {
    await forwardSetCookies([
      "binx_access_token=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800",
      "binx_refresh_token=def; Path=/; Secure",
    ]);
    expect(cookieJar.get("binx_access_token")?.value).toBe("abc");
    expect(cookieJar.get("binx_refresh_token")?.value).toBe("def");
  });

  it("forwardSetCookies is a no-op for an empty / missing list", async () => {
    await forwardSetCookies(undefined);
    await forwardSetCookies([]);
    expect(cookieJar.size).toBe(0);
  });

  it("clearAuthCookies deletes both session cookies", async () => {
    cookieJar.set("binx_access_token", { value: "a" });
    cookieJar.set("binx_refresh_token", { value: "r" });
    await clearAuthCookies();
    expect(cookieJar.size).toBe(0);
  });

  it("getRefreshToken reads the refresh cookie", async () => {
    cookieJar.set("binx_refresh_token", { value: "rt-123" });
    await expect(getRefreshToken()).resolves.toBe("rt-123");
  });

  it("logout clears the session", async () => {
    cookieJar.set("binx_access_token", { value: "a" });
    await logout();
    expect(cookieJar.get("binx_access_token")).toBeUndefined();
  });
});

describe("refreshSession", () => {
  it("returns false when there is no refresh token", async () => {
    await expect(refreshSession()).resolves.toBe(false);
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("exchanges the refresh token and stores the new pair", async () => {
    cookieJar.set("binx_refresh_token", { value: "old-rt" });
    mockedApi.post.mockResolvedValueOnce({ data: { access_token: "new-at", refresh_token: "new-rt" } });

    await expect(refreshSession()).resolves.toBe(true);
    expect(mockedApi.post).toHaveBeenCalledWith("/auth/refresh", { refresh_token: "old-rt" });
    expect(cookieJar.get("binx_access_token")?.value).toBe("new-at");
    expect(cookieJar.get("binx_refresh_token")?.value).toBe("new-rt");
  });

  it("clears the session and returns false when the refresh is rejected", async () => {
    cookieJar.set("binx_access_token", { value: "at" });
    cookieJar.set("binx_refresh_token", { value: "dead-rt" });
    mockedApi.post.mockRejectedValueOnce(axiosError(401, "Refresh token reuse detected"));

    await expect(refreshSession()).resolves.toBe(false);
    expect(cookieJar.size).toBe(0);
  });
});

describe("email verification", () => {
  it("getEmailVerificationTarget previews the account's email", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: { email: "new@example.com" } });
    await expect(getEmailVerificationTarget("tok")).resolves.toBe("new@example.com");
    expect(mockedApi.get).toHaveBeenCalledWith("/auth/verify-email", { params: { token: "tok" } });
  });

  it("getEmailVerificationTarget throws AuthApiError for a bad token", async () => {
    mockedApi.get.mockRejectedValueOnce(axiosError(400, "Invalid or expired verification link"));
    await expect(getEmailVerificationTarget("bad")).rejects.toMatchObject({ status: 400 });
  });

  it("verifyEmail stores the returned session and returns the message", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { access_token: "at", refresh_token: "rt", message: "Email verified" },
    });
    await expect(verifyEmail("tok")).resolves.toBe("Email verified");
    expect(cookieJar.get("binx_access_token")?.value).toBe("at");
  });

  it("verifyEmail throws AuthApiError for an invalid token", async () => {
    mockedApi.post.mockRejectedValueOnce(axiosError(400, "Invalid or expired token"));
    await expect(verifyEmail("bad")).rejects.toMatchObject({ message: "Invalid or expired token", status: 400 });
  });
});


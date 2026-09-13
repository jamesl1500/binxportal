import { beforeEach, describe, expect, it, vi } from "vitest";

// loginAction() only orchestrates: resolve our own origin, call our own
// /api/auth/login route, forward cookies, redirect. We mock all of that so
// this test proves the ORCHESTRATION is correct, without a real network call.
vi.mock("@/lib/auth", () => ({
  getInternalBaseUrl: vi.fn(async () => "http://localhost:3000"),
  forwardSetCookies: vi.fn(async () => undefined),
}));

// resolveHome decides where a signed-in user lands; default to the dashboard.
vi.mock("@/lib/portal", () => ({
  resolveHome: vi.fn(async () => "/dashboard"),
}));

// Next's real redirect() throws a special "NEXT_REDIRECT" error internally
// that the framework catches further up to actually perform the navigation.
// We mimic that "redirect = throw" behavior with our own sentinel error so we
// can assert on `.rejects.toThrow(...)` instead of needing a full Next runtime.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

// The action calls `axios.post(...)` directly (not the shared `api` instance,
// since that one is bound to binx-api's base URL, not our own Next.js
// origin). We mock the whole `axios` package, but reimplement `isAxiosError`
// with the same real-world check (an `isAxiosError: true` marker) so our fake
// errors below are recognized correctly by the code under test.
vi.mock("axios", () => {
  const isAxiosError = (payload: unknown): boolean =>
    typeof payload === "object" && payload !== null && (payload as { isAxiosError?: boolean }).isAxiosError === true;
  return { default: { post: vi.fn(), isAxiosError } };
});

import axios from "axios";
import { redirect } from "next/navigation";

import { forwardSetCookies } from "@/lib/auth";
import { loginAction, resendVerificationAction } from "./actions";

const mockedPost = vi.mocked(axios.post);
const mockedForwardSetCookies = vi.mocked(forwardSetCookies);
const mockedRedirect = vi.mocked(redirect);

/** Shapes a fake error the same way axios does for a non-2xx response. */
function axiosError(status: number, message: string) {
  return Object.assign(new Error(message), { isAxiosError: true, response: { status, data: { message } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loginAction", () => {
  // The full happy path: our internal /api/auth/login route responds with
  // Set-Cookie headers (simulated here as a plain headers object), and the
  // action must (1) forward those cookies onto its own response context and
  // (2) redirect to the dashboard. Because our fake redirect() throws, the
  // "successful" call actually rejects — that's expected and is how real
  // Next.js Server Actions behave too.
  it("forwards Set-Cookie headers and redirects to /dashboard on success", async () => {
    mockedPost.mockResolvedValueOnce({ headers: { "set-cookie": ["a=1", "b=2"] } });

    await expect(loginAction("a@b.com", "password123")).rejects.toThrow("REDIRECT:/dashboard");

    expect(mockedPost).toHaveBeenCalledWith("http://localhost:3000/api/auth/login", {
      email: "a@b.com",
      password: "password123",
    });
    expect(mockedForwardSetCookies).toHaveBeenCalledWith(["a=1", "b=2"]);
    expect(mockedRedirect).toHaveBeenCalledWith("/dashboard");
  });

  // On failure there's nothing to forward and nowhere to redirect — the
  // action should just resolve with `{ error }` so the client-side form can
  // render it, instead of throwing and taking down the whole action.
  it("returns the upstream error message without redirecting", async () => {
    mockedPost.mockRejectedValueOnce(axiosError(401, "Incorrect email or password"));

    await expect(loginAction("a@b.com", "wrong")).resolves.toEqual({
      error: "Incorrect email or password",
    });
    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(mockedForwardSetCookies).not.toHaveBeenCalled();
  });

  // A plain Error (e.g. DNS failure, connection refused) isn't an AxiosError
  // with a `.response`, so there's no upstream message to surface — fall back
  // to a safe, generic one instead of leaking a raw stack/message to the user.
  it("falls back to a generic message for non-axios errors", async () => {
    mockedPost.mockRejectedValueOnce(new Error("network down"));

    await expect(loginAction("a@b.com", "password123")).resolves.toEqual({
      error: "Unable to sign in",
    });
  });

  // binx-api's login() raises this exact message for an unverified account
  // (see modules/auth/service.py) — the action threads the attempted email
  // back through as `unverifiedEmail` so LoginForm can offer a resend button
  // instead of leaving the user stuck.
  it("returns unverifiedEmail when the account isn't verified yet", async () => {
    mockedPost.mockRejectedValueOnce(axiosError(403, "Email not verified"));

    await expect(loginAction("a@b.com", "password123")).resolves.toEqual({
      error: "Email not verified",
      unverifiedEmail: "a@b.com",
    });
  });

  // A disabled account is also a 403, but a different message — only the
  // exact "Email not verified" text should trigger the resend offer.
  it("does not set unverifiedEmail for other 403 errors", async () => {
    mockedPost.mockRejectedValueOnce(axiosError(403, "Account is disabled"));

    await expect(loginAction("a@b.com", "password123")).resolves.toEqual({
      error: "Account is disabled",
    });
  });
});

describe("resendVerificationAction", () => {
  it("calls our own resend-verification route and returns its message", async () => {
    mockedPost.mockResolvedValueOnce({
      data: { message: "If that account exists, a verification email has been sent." },
    });

    await expect(resendVerificationAction("a@b.com")).resolves.toEqual({
      message: "If that account exists, a verification email has been sent.",
    });
    expect(mockedPost).toHaveBeenCalledWith("http://localhost:3000/api/auth/resend-verification", {
      email: "a@b.com",
    });
  });

  it("returns the upstream error message on failure", async () => {
    mockedPost.mockRejectedValueOnce(axiosError(422, "Invalid email address"));

    await expect(resendVerificationAction("not-an-email")).resolves.toEqual({
      error: "Invalid email address",
    });
  });

  it("falls back to a generic message for non-axios errors", async () => {
    mockedPost.mockRejectedValueOnce(new Error("network down"));

    await expect(resendVerificationAction("a@b.com")).resolves.toEqual({
      error: "Unable to process your request",
    });
  });
});

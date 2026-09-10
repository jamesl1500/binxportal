import { beforeEach, describe, expect, it, vi } from "vitest";

// verifyEmailAction() only orchestrates: resolve our own origin, call our
// own /api/auth/verify-email route, forward cookies, redirect. We mock all
// of that so this test proves the ORCHESTRATION is correct, without a real
// network call.
vi.mock("@/lib/auth", () => ({
  getInternalBaseUrl: vi.fn(async () => "http://localhost:3000"),
  forwardSetCookies: vi.fn(async () => undefined),
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
import { verifyEmailAction } from "./actions";

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

describe("verifyEmailAction", () => {
  // The full happy path: our internal /api/auth/verify-email route responds
  // with Set-Cookie headers (binx-api now issues a token pair on successful
  // verification, so the user is signed in), and the action must (1) forward
  // those cookies onto its own response context and (2) redirect into
  // onboarding. Because our fake redirect() throws, the "successful" call
  // actually rejects — that's expected and is how real Next.js Server
  // Actions behave too.
  it("forwards Set-Cookie headers and redirects to /onboarding/one on success", async () => {
    mockedPost.mockResolvedValueOnce({ headers: { "set-cookie": ["a=1", "b=2"] } });

    await expect(verifyEmailAction("test-token")).rejects.toThrow("REDIRECT:/onboarding/one");

    expect(mockedPost).toHaveBeenCalledWith("http://localhost:3000/api/auth/verify-email", {
      token: "test-token",
    });
    expect(mockedForwardSetCookies).toHaveBeenCalledWith(["a=1", "b=2"]);
    expect(mockedRedirect).toHaveBeenCalledWith("/onboarding/one");
  });

  // On failure there's nothing to forward and nowhere to redirect — the
  // action should just resolve with `{ error }` so the client-side form can
  // render it, instead of throwing and taking down the whole action.
  it("returns the upstream error message without redirecting", async () => {
    mockedPost.mockRejectedValueOnce(axiosError(400, "Invalid or expired token"));

    await expect(verifyEmailAction("bad-token")).resolves.toEqual({
      error: "Invalid or expired token",
    });
    expect(mockedRedirect).not.toHaveBeenCalled();
    expect(mockedForwardSetCookies).not.toHaveBeenCalled();
  });

  // A plain Error (e.g. DNS failure, connection refused) isn't an AxiosError
  // with a `.response`, so there's no upstream message to surface — fall back
  // to a safe, generic one instead of leaking a raw stack/message to the user.
  it("falls back to a generic message for non-axios errors", async () => {
    mockedPost.mockRejectedValueOnce(new Error("network down"));

    await expect(verifyEmailAction("test-token")).resolves.toEqual({
      error: "Unable to verify email",
    });
  });
});

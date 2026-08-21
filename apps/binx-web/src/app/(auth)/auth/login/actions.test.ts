import { beforeEach, describe, expect, it, vi } from "vitest";

// loginAction() only orchestrates: resolve our own origin, call our own
// /api/auth/login route, forward cookies, redirect. We mock all of that so
// this test proves the ORCHESTRATION is correct, without a real network call.
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
import { loginAction } from "./actions";

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
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// signupAction() only needs to know our own origin to call /api/auth/signup —
// no cookies to forward and no redirect here (signup doesn't log the user in).
vi.mock("@/lib/auth", () => ({
  getInternalBaseUrl: vi.fn(async () => "http://localhost:3000"),
}));

// Reimplement axios.isAxiosError with the same real check it uses internally
// (an `isAxiosError: true` marker) so the fake errors built below are
// recognized correctly, without needing the real axios/HTTP stack.
vi.mock("axios", () => {
  const isAxiosError = (payload: unknown): boolean =>
    typeof payload === "object" && payload !== null && (payload as { isAxiosError?: boolean }).isAxiosError === true;
  return { default: { post: vi.fn(), isAxiosError } };
});

import axios from "axios";

import { signupAction } from "./actions";

const mockedPost = vi.mocked(axios.post);

/** Shapes a fake error the same way axios does for a non-2xx response. */
function axiosError(status: number, message: string) {
  return Object.assign(new Error(message), { isAxiosError: true, response: { status, data: { message } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signupAction", () => {
  // Confirms both the request shape sent to our own signup route (camelCase
  // field names, matching what SignupForm collects) and that the success
  // message is passed straight through to the caller.
  it("returns the success message from the signup route", async () => {
    mockedPost.mockResolvedValueOnce({
      data: { message: "Account created. Check your email to verify your address." },
    });

    const result = await signupAction("user", "a@b.com", "A B", "password123");

    expect(mockedPost).toHaveBeenCalledWith("http://localhost:3000/api/auth/signup", {
      userName: "user",
      email: "a@b.com",
      fullName: "A B",
      password: "password123",
    });
    expect(result).toEqual({ message: "Account created. Check your email to verify your address." });
  });

  it("returns the upstream error message on failure", async () => {
    mockedPost.mockRejectedValueOnce(axiosError(409, "Email already registered"));

    await expect(signupAction("user", "a@b.com", "A B", "password123")).resolves.toEqual({
      error: "Email already registered",
    });
  });

  it("falls back to a generic message for non-axios errors", async () => {
    mockedPost.mockRejectedValueOnce(new Error("network down"));

    await expect(signupAction("user", "a@b.com", "A B", "password123")).resolves.toEqual({
      error: "Unable to create account",
    });
  });
});

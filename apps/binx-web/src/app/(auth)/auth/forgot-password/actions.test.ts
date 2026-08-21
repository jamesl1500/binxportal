import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getInternalBaseUrl: vi.fn(async () => "http://localhost:3000"),
}));

// See login/actions.test.ts for why we hand-roll isAxiosError instead of
// using the real axios package here.
vi.mock("axios", () => {
  const isAxiosError = (payload: unknown): boolean =>
    typeof payload === "object" && payload !== null && (payload as { isAxiosError?: boolean }).isAxiosError === true;
  return { default: { post: vi.fn(), isAxiosError } };
});

import axios from "axios";

import { forgotPasswordAction } from "./actions";

const mockedPost = vi.mocked(axios.post);

function axiosError(status: number, message: string) {
  return Object.assign(new Error(message), { isAxiosError: true, response: { status, data: { message } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("forgotPasswordAction", () => {
  it("returns binx-api's generic success message", async () => {
    mockedPost.mockResolvedValueOnce({
      data: { message: "If that account exists, a password reset email has been sent." },
    });

    await expect(forgotPasswordAction("a@b.com")).resolves.toEqual({
      message: "If that account exists, a password reset email has been sent.",
    });
    expect(mockedPost).toHaveBeenCalledWith("http://localhost:3000/api/auth/forgot-password", { email: "a@b.com" });
  });

  it("returns the upstream error message on failure", async () => {
    mockedPost.mockRejectedValueOnce(axiosError(422, "Unable to process your request"));

    await expect(forgotPasswordAction("not-an-email")).resolves.toEqual({
      error: "Unable to process your request",
    });
  });
});

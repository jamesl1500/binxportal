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

import { resetPasswordAction } from "./actions";

const mockedPost = vi.mocked(axios.post);

function axiosError(status: number, message: string) {
  return Object.assign(new Error(message), { isAxiosError: true, response: { status, data: { message } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resetPasswordAction", () => {
  // Confirms the token from the emailed link and the new password are both
  // forwarded to /api/auth/reset-password under the field names it expects.
  it("returns the success message", async () => {
    mockedPost.mockResolvedValueOnce({ data: { message: "Password reset successfully." } });

    await expect(resetPasswordAction("token123", "newpassword123")).resolves.toEqual({
      message: "Password reset successfully.",
    });
    expect(mockedPost).toHaveBeenCalledWith("http://localhost:3000/api/auth/reset-password", {
      token: "token123",
      newPassword: "newpassword123",
    });
  });

  it("returns the upstream error message for an invalid token", async () => {
    mockedPost.mockRejectedValueOnce(axiosError(400, "Invalid or expired token"));

    await expect(resetPasswordAction("bad-token", "newpassword123")).resolves.toEqual({
      error: "Invalid or expired token",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

// confirmEmailChangeAction() only orchestrates: call confirmEmailChange,
// translate a thrown AuthApiError into a returned { error }. We mock just
// `confirmEmailChange` (keeping the real `AuthApiError` class, via
// importOriginal) so this test proves the ORCHESTRATION is correct, without
// a real network call.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, confirmEmailChange: vi.fn() };
});

import { AuthApiError, confirmEmailChange } from "@/lib/auth";
import { confirmEmailChangeAction } from "./actions";

const mockedConfirmEmailChange = vi.mocked(confirmEmailChange);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmEmailChangeAction", () => {
  it("returns the success message without redirecting", async () => {
    mockedConfirmEmailChange.mockResolvedValueOnce("Email address updated.");

    await expect(confirmEmailChangeAction("test-token")).resolves.toEqual({
      message: "Email address updated.",
    });
    expect(mockedConfirmEmailChange).toHaveBeenCalledWith("test-token");
  });

  it("returns the upstream error message on failure", async () => {
    mockedConfirmEmailChange.mockRejectedValueOnce(new AuthApiError("Invalid or expired token", 400));

    await expect(confirmEmailChangeAction("bad-token")).resolves.toEqual({
      error: "Invalid or expired token",
    });
  });

  it("falls back to a generic message for non-API errors", async () => {
    mockedConfirmEmailChange.mockRejectedValueOnce(new Error("network down"));

    await expect(confirmEmailChangeAction("test-token")).resolves.toEqual({
      error: "Unable to confirm email change",
    });
  });
});

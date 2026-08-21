import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/auth/reset-password/actions", () => ({
  resetPasswordAction: vi.fn(),
}));

import { resetPasswordAction } from "@/app/(auth)/auth/reset-password/actions";

import ResetPasswordForm from "./ResetPasswordForm";

const mockedResetPasswordAction = vi.mocked(resetPasswordAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordForm", () => {
  it("shows a validation error when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm token="token123" />);

    await user.type(screen.getByLabelText("New password"), "password123");
    await user.type(screen.getByLabelText("Confirm new password"), "different123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(mockedResetPasswordAction).not.toHaveBeenCalled();
  });

  // The `token` prop comes from the page reading `?token=...` off the URL
  // (see reset-password/page.tsx) and is passed through untouched to the
  // action — this confirms the form doesn't drop or mangle it.
  it("submits the token with the new password and shows the success message", async () => {
    mockedResetPasswordAction.mockResolvedValueOnce({ message: "Password reset successfully." });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="token123" />);

    await user.type(screen.getByLabelText("New password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm new password"), "newpassword123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByText("Password reset successfully.")).toBeInTheDocument();
    expect(mockedResetPasswordAction).toHaveBeenCalledWith("token123", "newpassword123");
  });

  // A different (expired/reused) token should surface binx-api's specific
  // rejection message rather than a generic failure.
  it("shows the server error for an invalid or expired token", async () => {
    mockedResetPasswordAction.mockResolvedValueOnce({ error: "Invalid or expired token" });
    const user = userEvent.setup();
    render(<ResetPasswordForm token="expired-token" />);

    await user.type(screen.getByLabelText("New password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm new password"), "newpassword123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByText("Invalid or expired token")).toBeInTheDocument();
  });
});

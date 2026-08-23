/**
 * Verify Email Form Test
 *
 * This module contains the tests for the VerifyEmailForm component.
 *
 * @module apps/binx-web/src/components/forms/auth/VerifyEmailForm/VerifyEmailForm.test.tsx
 * @author Binx.io
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Isolate the component under test by mocking its server action dependency.
vi.mock("@/app/(auth)/auth/verify-email/actions", () => ({
  verifyEmailAction: vi.fn(),
}));

import { verifyEmailAction } from "@/app/(auth)/auth/verify-email/actions";

import VerifyEmailForm from "./VerifyEmailForm";

const mockedVerifyEmailAction = vi.mocked(verifyEmailAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VerifyEmailForm", () => {
  // The email is shown for reassurance only — it comes from the emailed
  // link's query param, is read-only, and is never sent back to the server
  // (the token alone authorizes verification).
  it("shows the email read-only and never lets it be edited", () => {
    render(<VerifyEmailForm token="test-token" email="valid@example.com" />);

    const emailInput = screen.getByLabelText("Email");
    expect(emailInput).toHaveValue("valid@example.com");
    expect(emailInput).toHaveAttribute("readonly");
  });

  // Clicking the button calls verifyEmailAction with ONLY the token — no
  // email field is submitted, since binx-api's /auth/verify-email endpoint
  // doesn't need or accept one.
  it("calls verifyEmailAction with just the token on click", async () => {
    mockedVerifyEmailAction.mockResolvedValueOnce({ message: "Email verified successfully." });
    const user = userEvent.setup();
    render(<VerifyEmailForm token="test-token" email="valid@example.com" />);

    await user.click(screen.getByRole("button", { name: /verify email/i }));

    expect(mockedVerifyEmailAction).toHaveBeenCalledWith("test-token");
  });

  it("replaces the form with the success message", async () => {
    mockedVerifyEmailAction.mockResolvedValueOnce({ message: "Email verified successfully." });
    const user = userEvent.setup();
    render(<VerifyEmailForm token="test-token" email="valid@example.com" />);

    await user.click(screen.getByRole("button", { name: /verify email/i }));

    expect(await screen.findByText("Email verified successfully.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("shows the server error for an invalid or expired token", async () => {
    mockedVerifyEmailAction.mockResolvedValueOnce({ error: "Invalid or expired token" });
    const user = userEvent.setup();
    render(<VerifyEmailForm token="bad-token" email="valid@example.com" />);

    await user.click(screen.getByRole("button", { name: /verify email/i }));

    expect(await screen.findByText("Invalid or expired token")).toBeInTheDocument();
  });
});
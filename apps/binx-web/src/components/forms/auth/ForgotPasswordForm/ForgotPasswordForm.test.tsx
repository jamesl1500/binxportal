import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/auth/forgot-password/actions", () => ({
  forgotPasswordAction: vi.fn(),
}));

import { forgotPasswordAction } from "@/app/(auth)/auth/forgot-password/actions";

import ForgotPasswordForm from "./ForgotPasswordForm";

const mockedForgotPasswordAction = vi.mocked(forgotPasswordAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ForgotPasswordForm", () => {
  it("shows a validation error for an invalid email", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(mockedForgotPasswordAction).not.toHaveBeenCalled();
  });

  // Like SignupForm, this component swaps its own markup for a success
  // message rather than redirecting. We assert both that the message shows up
  // AND that the email input is gone — proving the form was actually replaced,
  // not just that a message was appended alongside it.
  it("replaces the form with the success message", async () => {
    mockedForgotPasswordAction.mockResolvedValueOnce({
      message: "If that account exists, a password reset email has been sent.",
    });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(
      await screen.findByText("If that account exists, a password reset email has been sent."),
    ).toBeInTheDocument();
    expect(mockedForgotPasswordAction).toHaveBeenCalledWith("a@b.com");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });
});

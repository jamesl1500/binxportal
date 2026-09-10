import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/account/actions", () => ({
  requestEmailChangeAction: vi.fn(),
}));

import { requestEmailChangeAction } from "@/app/(app)/account/actions";

import ChangeEmailForm from "./ChangeEmailForm";

const mockedRequestEmailChangeAction = vi.mocked(requestEmailChangeAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChangeEmailForm", () => {
  it("shows the current email read-only", () => {
    render(<ChangeEmailForm currentEmail="jane@example.com" />);

    const currentEmailInput = screen.getByLabelText("Current email");
    expect(currentEmailInput).toHaveValue("jane@example.com");
    expect(currentEmailInput).toBeDisabled();
  });

  it("shows a validation error instead of submitting for an invalid new email", async () => {
    const user = userEvent.setup();
    render(<ChangeEmailForm currentEmail="jane@example.com" />);

    await user.type(screen.getByLabelText("New email"), "not-an-email");
    await user.type(screen.getByLabelText("Current password"), "correct-password");
    await user.click(screen.getByRole("button", { name: /change email/i }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(mockedRequestEmailChangeAction).not.toHaveBeenCalled();
  });

  it("submits the new email and password, then shows the confirmation message", async () => {
    mockedRequestEmailChangeAction.mockResolvedValueOnce({ message: "Check your new inbox to confirm the change." });
    const user = userEvent.setup();
    render(<ChangeEmailForm currentEmail="jane@example.com" />);

    await user.type(screen.getByLabelText("New email"), "new@example.com");
    await user.type(screen.getByLabelText("Current password"), "correct-password");
    await user.click(screen.getByRole("button", { name: /change email/i }));

    expect(await screen.findByText("Check your new inbox to confirm the change.")).toBeInTheDocument();
    expect(mockedRequestEmailChangeAction).toHaveBeenCalledWith({
      currentPassword: "correct-password",
      newEmail: "new@example.com",
    });
  });

  it("shows the server error on failure", async () => {
    mockedRequestEmailChangeAction.mockResolvedValueOnce({ error: "Incorrect password" });
    const user = userEvent.setup();
    render(<ChangeEmailForm currentEmail="jane@example.com" />);

    await user.type(screen.getByLabelText("New email"), "new@example.com");
    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /change email/i }));

    expect(await screen.findByText("Incorrect password")).toBeInTheDocument();
  });
});

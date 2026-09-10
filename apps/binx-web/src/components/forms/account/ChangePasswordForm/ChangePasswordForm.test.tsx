import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/account/actions", () => ({
  changePasswordAction: vi.fn(),
}));

import { changePasswordAction } from "@/app/(app)/account/actions";

import ChangePasswordForm from "./ChangePasswordForm";

const mockedChangePasswordAction = vi.mocked(changePasswordAction);

beforeEach(() => {
  vi.clearAllMocks();
});

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Current password"), "old-password");
  await user.type(screen.getByLabelText("New password"), "new-password-123");
  await user.type(screen.getByLabelText("Confirm new password"), "new-password-123");
}

describe("ChangePasswordForm", () => {
  it("shows a validation error when the new passwords do not match", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("Current password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "new-password-123");
    await user.type(screen.getByLabelText("Confirm new password"), "different-password");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(mockedChangePasswordAction).not.toHaveBeenCalled();
  });

  it("shows a validation error when the new password is too short", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await user.type(screen.getByLabelText("Current password"), "old-password");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm new password"), "short");
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(mockedChangePasswordAction).not.toHaveBeenCalled();
  });

  it("submits the current and new password, then shows a success message", async () => {
    mockedChangePasswordAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
    expect(mockedChangePasswordAction).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password-123",
    });
  });

  it("shows the server error on failure", async () => {
    mockedChangePasswordAction.mockResolvedValueOnce({ error: "Incorrect password" });
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /update password/i }));

    expect(await screen.findByText("Incorrect password")).toBeInTheDocument();
  });
});

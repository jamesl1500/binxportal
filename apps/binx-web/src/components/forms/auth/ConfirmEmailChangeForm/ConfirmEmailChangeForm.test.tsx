import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/auth/confirm-email/actions", () => ({
  confirmEmailChangeAction: vi.fn(),
}));

import { confirmEmailChangeAction } from "@/app/(auth)/auth/confirm-email/actions";

import ConfirmEmailChangeForm from "./ConfirmEmailChangeForm";

const mockedConfirmEmailChangeAction = vi.mocked(confirmEmailChangeAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConfirmEmailChangeForm", () => {
  it("shows the pending new email read-only and never lets it be edited", () => {
    render(<ConfirmEmailChangeForm token="test-token" newEmail="new@example.com" />);

    const emailInput = screen.getByLabelText("New email");
    expect(emailInput).toHaveValue("new@example.com");
    expect(emailInput).toHaveAttribute("readonly");
  });

  it("calls confirmEmailChangeAction with just the token on click", async () => {
    mockedConfirmEmailChangeAction.mockResolvedValueOnce({ message: "Email address updated." });
    const user = userEvent.setup();
    render(<ConfirmEmailChangeForm token="test-token" newEmail="new@example.com" />);

    await user.click(screen.getByRole("button", { name: /confirm email change/i }));

    expect(mockedConfirmEmailChangeAction).toHaveBeenCalledWith("test-token");
    expect(await screen.findByText("Email address updated.")).toBeInTheDocument();
  });

  it("shows the server error for an invalid or expired token", async () => {
    mockedConfirmEmailChangeAction.mockResolvedValueOnce({ error: "Invalid or expired token" });
    const user = userEvent.setup();
    render(<ConfirmEmailChangeForm token="bad-token" newEmail="new@example.com" />);

    await user.click(screen.getByRole("button", { name: /confirm email change/i }));

    expect(await screen.findByText("Invalid or expired token")).toBeInTheDocument();
  });
});

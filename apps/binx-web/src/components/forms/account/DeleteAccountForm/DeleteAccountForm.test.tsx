import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/account/actions", () => ({
  deleteAccountAction: vi.fn(),
}));

import { deleteAccountAction } from "@/app/(app)/account/actions";

import DeleteAccountForm from "./DeleteAccountForm";

const mockedDeleteAccountAction = vi.mocked(deleteAccountAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteAccountForm", () => {
  it("requires typing DELETE before submitting", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountForm />);

    await user.type(screen.getByLabelText("Current password"), "correct-password");
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "delete");
    await user.click(screen.getByRole("button", { name: /delete my account/i }));

    expect(await screen.findByText('Type "DELETE" to confirm')).toBeInTheDocument();
    expect(mockedDeleteAccountAction).not.toHaveBeenCalled();
  });

  it("calls deleteAccountAction with just the password once confirmed", async () => {
    // On success, deleteAccountAction redirects and this promise never
    // resolves within the component's lifetime — a pending mock is enough
    // to prove the call happened with the right argument.
    mockedDeleteAccountAction.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    render(<DeleteAccountForm />);

    await user.type(screen.getByLabelText("Current password"), "correct-password");
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByRole("button", { name: /delete my account/i }));

    expect(mockedDeleteAccountAction).toHaveBeenCalledWith("correct-password");
  });

  it("shows the server error on failure", async () => {
    mockedDeleteAccountAction.mockResolvedValueOnce({ error: "Incorrect password" });
    const user = userEvent.setup();
    render(<DeleteAccountForm />);

    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(screen.getByRole("button", { name: /delete my account/i }));

    expect(await screen.findByText("Incorrect password")).toBeInTheDocument();
  });
});

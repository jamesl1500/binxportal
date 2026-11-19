import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/admin/actions", () => ({ userAction: vi.fn() }));

import { userAction } from "@/app/(app)/admin/actions";

import UserActionsPanel from "./UserActionsPanel";

const mockedAction = vi.mocked(userAction);

const BASE = {
  userId: "u1",
  name: "Tess Teammate",
  email: "tess@pixel.example",
  isActive: true,
  isVerified: true,
  isAdmin: false,
  isSelf: false,
  activeSessions: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedAction.mockResolvedValue({ message: "Done" });
});

describe("UserActionsPanel", () => {
  it("sends a password reset straight away and shows the result", async () => {
    const user = userEvent.setup();
    render(<UserActionsPanel {...BASE} />);
    await user.click(screen.getByRole("button", { name: "Send password reset" }));
    expect(mockedAction).toHaveBeenCalledWith("u1", "password-reset", undefined);
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });

  it("asks before deactivating, and passes the reason", async () => {
    const user = userEvent.setup();
    render(<UserActionsPanel {...BASE} />);
    await user.type(screen.getByRole("textbox", { name: /reason/i }), "Left the agency");
    await user.click(screen.getByRole("button", { name: "Deactivate account" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Deactivate Tess Teammate's account?");
    expect(mockedAction).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    expect(mockedAction).toHaveBeenCalledWith("u1", "deactivate", "Left the agency");
  });

  it("does nothing if the confirm is cancelled", async () => {
    const user = userEvent.setup();
    render(<UserActionsPanel {...BASE} />);
    await user.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Ends their 2 active sessions");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mockedAction).not.toHaveBeenCalled();
  });

  it("offers verification help only to unverified accounts", () => {
    const { rerender } = render(<UserActionsPanel {...BASE} />);
    expect(screen.queryByRole("button", { name: /verification/i })).not.toBeInTheDocument();
    rerender(<UserActionsPanel {...BASE} isVerified={false} />);
    expect(screen.getByRole("button", { name: "Resend verification email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark email verified" })).toBeInTheDocument();
  });

  it("offers reactivation for a deactivated account and blocks the reset", () => {
    render(<UserActionsPanel {...BASE} isActive={false} />);
    expect(screen.getByRole("button", { name: "Reactivate account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send password reset" })).toBeDisabled();
  });

  it("never lets you deactivate or demote yourself", () => {
    render(<UserActionsPanel {...BASE} isSelf isAdmin />);
    expect(screen.queryByRole("button", { name: /deactivate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /admin access/i })).not.toBeInTheDocument();
  });

  it("surfaces an API refusal", async () => {
    mockedAction.mockResolvedValueOnce({ error: "Reactivate the account before sending a reset link" });
    const user = userEvent.setup();
    render(<UserActionsPanel {...BASE} />);
    await user.click(screen.getByRole("button", { name: "Send password reset" }));
    expect(await screen.findByText(/reactivate the account/i)).toBeInTheDocument();
  });
});

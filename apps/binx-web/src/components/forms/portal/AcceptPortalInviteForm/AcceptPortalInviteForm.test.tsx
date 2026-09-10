import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(auth)/auth/portal-invite/actions", () => ({ acceptPortalInviteAction: vi.fn() }));

import { acceptPortalInviteAction } from "@/app/(auth)/auth/portal-invite/actions";
import AcceptPortalInviteForm from "./AcceptPortalInviteForm";

const mocked = vi.mocked(acceptPortalInviteAction);
const preview = {
  agency_name: "Northlight Studio",
  client_name: "Fjord & Field",
  invited_by_name: "Morgan",
  email: "priya@client.test",
} as never;

beforeEach(() => vi.clearAllMocks());

describe("AcceptPortalInviteForm", () => {
  it("shows the invitation details", () => {
    render(<AcceptPortalInviteForm token="tok" preview={preview} />);
    expect(screen.getByText("Northlight Studio")).toBeInTheDocument();
    expect(screen.getByText("Fjord & Field")).toBeInTheDocument();
    expect(screen.getByText("Morgan")).toBeInTheDocument();
  });

  it("accepts the invitation on click", async () => {
    mocked.mockResolvedValueOnce(undefined as never);
    render(<AcceptPortalInviteForm token="tok" preview={preview} />);
    await userEvent.click(screen.getByRole("button", { name: /enter fjord & field's portal/i }));
    expect(mocked).toHaveBeenCalledWith("tok");
  });

  it("shows an inline error the action returns", async () => {
    mocked.mockResolvedValueOnce({ error: "This invitation has expired" } as never);
    render(<AcceptPortalInviteForm token="tok" preview={preview} />);
    await userEvent.click(screen.getByRole("button", { name: /enter/i }));
    expect(await screen.findByText("This invitation has expired")).toBeInTheDocument();
  });
});

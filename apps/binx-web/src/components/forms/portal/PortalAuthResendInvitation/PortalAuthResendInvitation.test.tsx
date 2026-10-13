import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(portal-auth)/portal/resend-invitation/actions", () => ({
  resendPortalInvitationAction: vi.fn(),
  searchPortalAgenciesAction: vi.fn(),
}));

import {
  resendPortalInvitationAction,
  searchPortalAgenciesAction,
} from "@/app/(portal-auth)/portal/resend-invitation/actions";

import PortalAuthResendInvitation from "./PortalAuthResendInvitation";

const mockedResend = vi.mocked(resendPortalInvitationAction);
const mockedSearch = vi.mocked(searchPortalAgenciesAction);

const SENT = "If that agency has an active invitation for this email, we've sent it again. Check your inbox.";

beforeEach(() => {
  vi.clearAllMocks();
  mockedSearch.mockResolvedValue([{ id: "a1", name: "Pixel Forge" }]);
  mockedResend.mockResolvedValue({ message: SENT });
});

describe("PortalAuthResendInvitation", () => {
  it("validates before asking the server for anything", async () => {
    const user = userEvent.setup();
    render(<PortalAuthResendInvitation />);

    await user.click(screen.getByRole("button", { name: "Resend Invitation" }));

    expect(await screen.findByText("Agency name is required")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(mockedResend).not.toHaveBeenCalled();
  });

  it("sends the picked agency's id with the email and confirms", async () => {
    const user = userEvent.setup();
    render(<PortalAuthResendInvitation />);

    await user.type(screen.getByLabelText("Agency Name"), "pix");
    await user.click(await screen.findByRole("option", { name: "Pixel Forge" }));
    await user.type(screen.getByLabelText("Email"), "casey@northwind.example");
    await user.click(screen.getByRole("button", { name: "Resend Invitation" }));

    expect(await screen.findByText(SENT)).toBeInTheDocument();
    expect(mockedResend).toHaveBeenCalledWith({
      email: "casey@northwind.example",
      agencyName: "Pixel Forge",
      agencyId: "a1",
    });
    // The form is replaced, so it can't be re-submitted in a loop.
    expect(screen.queryByRole("button", { name: "Resend Invitation" })).not.toBeInTheDocument();
  });

  it("falls back to the typed name when no suggestion was picked", async () => {
    const user = userEvent.setup();
    render(<PortalAuthResendInvitation />);

    await user.type(screen.getByLabelText("Agency Name"), "Pixel Forge");
    await user.type(screen.getByLabelText("Email"), "casey@northwind.example");
    await user.click(screen.getByRole("button", { name: "Resend Invitation" }));

    await screen.findByText(SENT);
    expect(mockedResend).toHaveBeenCalledWith({
      email: "casey@northwind.example",
      agencyName: "Pixel Forge",
      agencyId: undefined,
    });
  });

  it("shows the error and keeps the form when the request can't be made", async () => {
    mockedResend.mockResolvedValueOnce({ error: "Too many requests right now — please try again in a little while." });
    const user = userEvent.setup();
    render(<PortalAuthResendInvitation />);

    await user.type(screen.getByLabelText("Agency Name"), "Pixel Forge");
    await user.type(screen.getByLabelText("Email"), "casey@northwind.example");
    await user.click(screen.getByRole("button", { name: "Resend Invitation" }));

    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend Invitation" })).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockedRefresh }) }));

vi.mock("@/app/(portal)/portal/proposals/actions", () => ({
  signPortalProposalAction: vi.fn(),
  declinePortalProposalAction: vi.fn(),
}));

const mockedToastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => mockedToastError(...args) } }));

import { declinePortalProposalAction, signPortalProposalAction } from "@/app/(portal)/portal/proposals/actions";

import PortalProposalActions from "./PortalProposalActions";

const mockedSign = vi.mocked(signPortalProposalAction);
const mockedDecline = vi.mocked(declinePortalProposalAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PortalProposalActions", () => {
  it("shows Sign and Decline choices with no form up front", () => {
    render(<PortalProposalActions proposalId="p1" />);

    expect(screen.getByRole("button", { name: "Sign this proposal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument();
  });

  it("signs with a single click — no name or email to type", async () => {
    mockedSign.mockResolvedValueOnce({ proposal: { status: "signed" } as never });
    const user = userEvent.setup();
    render(<PortalProposalActions proposalId="p1" />);

    await user.click(screen.getByRole("button", { name: "Sign this proposal" }));

    expect(mockedSign).toHaveBeenCalledWith("p1");
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });

  it("shows a toast when signing fails", async () => {
    mockedSign.mockResolvedValueOnce({ error: "This proposal has expired" });
    const user = userEvent.setup();
    render(<PortalProposalActions proposalId="p1" />);

    await user.click(screen.getByRole("button", { name: "Sign this proposal" }));

    expect(mockedToastError).toHaveBeenCalledWith("This proposal has expired");
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("declines with an optional reason", async () => {
    mockedDecline.mockResolvedValueOnce({ proposal: { status: "declined" } as never });
    const user = userEvent.setup();
    render(<PortalProposalActions proposalId="p1" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));
    await user.type(screen.getByLabelText(/reason/i), "Going with another agency");
    await user.click(screen.getByRole("button", { name: "Decline proposal" }));

    expect(mockedDecline).toHaveBeenCalledWith("p1", "Going with another agency");
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });

  it("Back returns to the choose step without declining", async () => {
    const user = userEvent.setup();
    render(<PortalProposalActions proposalId="p1" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("button", { name: "Sign this proposal" })).toBeInTheDocument();
    expect(mockedDecline).not.toHaveBeenCalled();
  });
});

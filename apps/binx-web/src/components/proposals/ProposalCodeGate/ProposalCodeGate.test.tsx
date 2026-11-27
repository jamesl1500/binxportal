import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/proposals/public/actions", () => ({
  requestProposalCodeAction: vi.fn(),
  verifyProposalCodeAction: vi.fn(),
}));

const mockedToast = { error: vi.fn(), success: vi.fn() };
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockedToast.error(...args),
    success: (...args: unknown[]) => mockedToast.success(...args),
  },
}));

import { requestProposalCodeAction, verifyProposalCodeAction } from "@/app/proposals/public/actions";

import ProposalCodeGate from "./ProposalCodeGate";

const mockedRequest = vi.mocked(requestProposalCodeAction);
const mockedVerify = vi.mocked(verifyProposalCodeAction);
const props = { token: "tok", agencyName: "Northlight", title: "Brand refresh", emailHint: "j•••@fjord.example" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalCodeGate", () => {
  it("says who it's from and where the code goes, without the proposal", () => {
    render(<ProposalCodeGate {...props} />);
    expect(screen.getByRole("heading", { name: "Brand refresh" })).toBeInTheDocument();
    expect(screen.getByText("Northlight")).toBeInTheDocument();
    expect(screen.getByText("j•••@fjord.example")).toBeInTheDocument();
    expect(screen.queryByLabelText("Code from the email")).not.toBeInTheDocument();
  });

  it("emails a code, then opens with it", async () => {
    mockedRequest.mockResolvedValueOnce({ emailHint: "j•••@fjord.example" });
    mockedVerify.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<ProposalCodeGate {...props} />);

    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(mockedRequest).toHaveBeenCalledWith("tok");
    expect(mockedToast.success).toHaveBeenCalledWith("Code sent to j•••@fjord.example");

    await user.type(screen.getByLabelText("Code from the email"), "123456");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(mockedVerify).toHaveBeenCalledWith("tok", "123456");
  });

  it("shows a wrong code's error by the box", async () => {
    mockedRequest.mockResolvedValueOnce({ emailHint: "j•••@fjord.example" });
    mockedVerify.mockResolvedValueOnce({ error: "That code isn't right. 4 tries left." });
    const user = userEvent.setup();
    render(<ProposalCodeGate {...props} />);

    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.type(screen.getByLabelText("Code from the email"), "000000");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("alert")).toHaveTextContent("That code isn't right. 4 tries left.");
    expect(screen.getByLabelText("Code from the email")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows why a code couldn't be sent", async () => {
    mockedRequest.mockResolvedValueOnce({ error: "We've just sent a code. Give it a minute, then ask again." });
    const user = userEvent.setup();
    render(<ProposalCodeGate {...props} />);

    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(mockedToast.error).toHaveBeenCalledWith("We've just sent a code. Give it a minute, then ask again.");
    expect(screen.queryByLabelText("Code from the email")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/proposals/public/actions", () => ({
  signPublicProposalAction: vi.fn(),
  declinePublicProposalAction: vi.fn(),
}));

import { declinePublicProposalAction, signPublicProposalAction } from "@/app/proposals/public/actions";
import { toast } from "sonner";
import PublicProposalActions from "./PublicProposalActions";

const sign = vi.mocked(signPublicProposalAction);
const decline = vi.mocked(declinePublicProposalAction);

beforeEach(() => {
  vi.clearAllMocks();
  sign.mockResolvedValue({} as never);
  decline.mockResolvedValue({} as never);
});

describe("PublicProposalActions", () => {
  it("shows the sign form prefilled with the recipient name and submits it", async () => {
    const user = userEvent.setup();
    render(<PublicProposalActions token="tok" recipientName="Jamie Rivera" />);

    await user.click(screen.getByRole("button", { name: "Sign this proposal" }));
    expect(screen.getByLabelText("Your name")).toHaveValue("Jamie Rivera");

    await user.type(screen.getByLabelText("Your email"), "jamie@example.com");
    await user.click(screen.getByRole("button", { name: "Sign proposal" }));

    expect(sign).toHaveBeenCalledWith("tok", "Jamie Rivera", "jamie@example.com");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the decline form and submits an optional reason", async () => {
    const user = userEvent.setup();
    render(<PublicProposalActions token="tok" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));
    await user.type(screen.getByLabelText("Reason (optional)"), "Went with another agency");
    await user.click(screen.getByRole("button", { name: "Decline proposal" }));

    expect(decline).toHaveBeenCalledWith("tok", "Went with another agency");
    expect(refresh).toHaveBeenCalled();
  });

  it("declines with a null reason when left blank", async () => {
    const user = userEvent.setup();
    render(<PublicProposalActions token="tok" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));
    await user.click(screen.getByRole("button", { name: "Decline proposal" }));

    expect(decline).toHaveBeenCalledWith("tok", null);
  });

  it("toasts an error the action returns", async () => {
    sign.mockResolvedValueOnce({ error: "This proposal has expired — ask the agency to resend it" } as never);
    const user = userEvent.setup();
    render(<PublicProposalActions token="tok" />);

    await user.click(screen.getByRole("button", { name: "Sign this proposal" }));
    await user.type(screen.getByLabelText("Your name"), "Jamie Rivera");
    await user.type(screen.getByLabelText("Your email"), "jamie@example.com");
    await user.click(screen.getByRole("button", { name: "Sign proposal" }));

    expect(toast.error).toHaveBeenCalledWith("This proposal has expired — ask the agency to resend it");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("goes back to the choice from either form", async () => {
    const user = userEvent.setup();
    render(<PublicProposalActions token="tok" />);

    await user.click(screen.getByRole("button", { name: "Sign this proposal" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Sign this proposal" })).toBeInTheDocument();
  });
});

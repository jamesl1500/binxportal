import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/proposals/actions", () => ({
  deleteProposalAction: vi.fn(),
  sendProposalAction: vi.fn(),
}));

Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });

import { deleteProposalAction, sendProposalAction } from "@/app/(app)/proposals/actions";
import { toast } from "sonner";
import ProposalActions from "./ProposalActions";

const del = vi.mocked(deleteProposalAction);
const send = vi.mocked(sendProposalAction);

const proposal = (status: string, overrides: Record<string, unknown> = {}) =>
  ({
    id: "p1",
    title: "Website redesign",
    status,
    display_status: status,
    recipient_email: "jamie@example.com",
    share_url: "https://app.example.com/proposals/public?token=tok",
    ...overrides,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  del.mockResolvedValue({} as never);
  send.mockResolvedValue({} as never);
});

describe("ProposalActions", () => {
  it("draft shows Edit, Delete and Send", () => {
    render(<ProposalActions agencyId="a1" proposal={proposal("draft")} />);
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/proposals/p1/edit");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send proposal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy share link/i })).not.toBeInTheDocument();
  });

  it("deletes a draft through the confirm dialog", async () => {
    render(<ProposalActions agencyId="a1" proposal={proposal("draft")} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete Website redesign?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete proposal" }));
    expect(del).toHaveBeenCalledWith("a1", "p1");
    expect(refresh).toHaveBeenCalled();
  });

  it("sends a draft via the confirm dialog, prefilled with the recipient email", async () => {
    render(<ProposalActions agencyId="a1" proposal={proposal("draft")} />);
    await userEvent.click(screen.getByRole("button", { name: "Send proposal" }));
    expect(await screen.findByText("Send Website redesign?")).toBeInTheDocument();
    expect(screen.getByLabelText("Recipient email")).toHaveValue("jamie@example.com");
    await userEvent.click(screen.getAllByRole("button", { name: "Send proposal" }).at(-1)!);
    expect(send).toHaveBeenCalledWith("a1", "p1", "jamie@example.com");
  });

  it("sent proposal hides edit/delete/send and shows a status hint plus copy link", () => {
    render(<ProposalActions agencyId="a1" proposal={proposal("sent")} />);
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Send proposal" })).toBeNull();
    expect(screen.getByText(/waiting on the recipient/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy share link/i })).toBeInTheDocument();
  });

  it("copies the share link", async () => {
    render(<ProposalActions agencyId="a1" proposal={proposal("signed")} />);
    await userEvent.click(screen.getByRole("button", { name: /copy share link/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://app.example.com/proposals/public?token=tok");
    expect(toast.success).toHaveBeenCalledWith("Share link copied");
  });

  it("toasts an error the action returns", async () => {
    del.mockResolvedValueOnce({ error: "Cannot delete a sent proposal" } as never);
    render(<ProposalActions agencyId="a1" proposal={proposal("draft")} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete proposal" }));
    expect(toast.error).toHaveBeenCalledWith("Cannot delete a sent proposal");
  });
});

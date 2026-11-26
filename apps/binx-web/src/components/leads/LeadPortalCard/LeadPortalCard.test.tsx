import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/leads/portal-actions", () => ({
  enableLeadPortalAction: vi.fn(),
  disableLeadPortalAction: vi.fn(),
  resetLeadPortalLinkAction: vi.fn(),
  replyInLeadPortalAction: vi.fn(),
}));

import { toast } from "sonner";

import {
  disableLeadPortalAction,
  enableLeadPortalAction,
  replyInLeadPortalAction,
  resetLeadPortalLinkAction,
} from "@/app/(app)/leads/portal-actions";
import type { LeadPortal } from "@/lib/lead-portal";

import LeadPortalCard from "./LeadPortalCard";

const off: LeadPortal = { enabled: false, url: null, welcome_message: null, last_viewed_at: null, messages: [] };
const on: LeadPortal = {
  enabled: true,
  url: "https://app.example/lead-portal?token=tok",
  welcome_message: "Hello!",
  last_viewed_at: null,
  messages: [
    {
      id: "m1",
      author_kind: "lead",
      author_name: "Alex Kim",
      body: "Does it include the logo?",
      created_at: "2026-11-26T10:00:00Z",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LeadPortalCard", () => {
  it("turns the portal on with a welcome note", async () => {
    vi.mocked(enableLeadPortalAction).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LeadPortalCard agencyId="a1" leadId="l1" leadName="Northwind" portal={off} />);

    await user.type(screen.getByLabelText(/welcome note/i), "Everything is here.");
    await user.click(screen.getByRole("button", { name: "Turn on lead portal" }));
    expect(enableLeadPortalAction).toHaveBeenCalledWith("a1", "l1", "Everything is here.");
    expect(toast.success).toHaveBeenCalledWith("Lead portal is on");
  });

  it("points to the plans when the plan doesn't include it", async () => {
    vi.mocked(enableLeadPortalAction).mockResolvedValueOnce({
      error: "Lead portals are on the Starter plan and above.",
      needsUpgrade: true,
    });
    const user = userEvent.setup();
    render(<LeadPortalCard agencyId="a1" leadId="l1" leadName="Northwind" portal={off} />);
    await user.click(screen.getByRole("button", { name: "Turn on lead portal" }));
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/settings/plan");
  });

  it("shows the link and the questions, and sends a reply", async () => {
    vi.mocked(replyInLeadPortalAction).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LeadPortalCard agencyId="a1" leadId="l1" leadName="Northwind" portal={on} />);

    expect(screen.getByText("https://app.example/lead-portal?token=tok")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the lead portal" })).toHaveAttribute(
      "href",
      "https://app.example/lead-portal?token=tok",
    );
    expect(screen.getByText("Does it include the logo?")).toBeInTheDocument();
    expect(screen.getByText("Not opened yet")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Reply to Northwind"), "Yes, phase one.");
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(replyInLeadPortalAction).toHaveBeenCalledWith("a1", "l1", "Yes, phase one.");
    expect(screen.getByLabelText("Reply to Northwind")).toHaveValue("");
  });

  it("asks before resetting the link, and can turn it off", async () => {
    vi.mocked(resetLeadPortalLinkAction).mockResolvedValueOnce({});
    vi.mocked(disableLeadPortalAction).mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<LeadPortalCard agencyId="a1" leadId="l1" leadName="Northwind" portal={on} />);

    await user.click(screen.getByRole("button", { name: "Reset link" }));
    expect(resetLeadPortalLinkAction).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Reset link", hidden: false }));
    expect(resetLeadPortalLinkAction).toHaveBeenCalledWith("a1", "l1");

    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(disableLeadPortalAction).toHaveBeenCalledWith("a1", "l1");
  });
});

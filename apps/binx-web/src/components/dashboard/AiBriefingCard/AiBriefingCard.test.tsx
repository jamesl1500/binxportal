import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/dashboard/actions", () => ({
  getAiBriefingAction: vi.fn(),
}));

import { getAiBriefingAction } from "@/app/(app)/dashboard/actions";

import AiBriefingCard from "./AiBriefingCard";

const mockedGetBriefing = vi.mocked(getAiBriefingAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiBriefingCard", () => {
  it("loads and shows the briefing on mount", async () => {
    mockedGetBriefing.mockResolvedValueOnce({ briefing: "You have 2 overdue invoices." });
    render(<AiBriefingCard agencyId="a1" />);

    expect(await screen.findByText("You have 2 overdue invoices.")).toBeInTheDocument();
    expect(mockedGetBriefing).toHaveBeenCalledWith("a1");
  });

  it("renders a clean message when AI isn't configured, with no error styling", async () => {
    mockedGetBriefing.mockResolvedValueOnce({ error: "AI isn't configured for this agency yet.", notConfigured: true });
    render(<AiBriefingCard agencyId="a1" />);

    expect(await screen.findByText("AI isn't configured for this environment yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refresh/i })).not.toBeInTheDocument();
  });

  it("shows an error state for anything else, with a way to retry", async () => {
    mockedGetBriefing.mockResolvedValueOnce({ error: "AI is temporarily unavailable — try again shortly." });
    render(<AiBriefingCard agencyId="a1" />);

    expect(await screen.findByText("AI is temporarily unavailable — try again shortly.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });

  it("regenerates the briefing when Refresh is clicked", async () => {
    mockedGetBriefing.mockResolvedValueOnce({ briefing: "First briefing." });
    const user = userEvent.setup();
    render(<AiBriefingCard agencyId="a1" />);
    await screen.findByText("First briefing.");

    mockedGetBriefing.mockResolvedValueOnce({ briefing: "Second briefing." });
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    expect(await screen.findByText("Second briefing.")).toBeInTheDocument();
    expect(mockedGetBriefing).toHaveBeenCalledTimes(2);
  });
});

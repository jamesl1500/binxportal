import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/dashboard/actions", () => ({
  getAiBriefingAction: vi.fn(),
}));

import { getAiBriefingAction, type AiBriefingActionResult } from "@/app/(app)/dashboard/actions";

import AiBriefingCard from "./AiBriefingCard";

const mockedGetBriefing = vi.mocked(getAiBriefingAction);

/** Renders with a streamed result, flushing the Suspense retry inside act. */
async function renderStreamed(initial: Promise<AiBriefingActionResult>) {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<AiBriefingCard agencyId="a1" initial={initial} />);
  });
  return utils;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiBriefingCard", () => {
  it("loads and shows the briefing on mount", async () => {
    mockedGetBriefing.mockResolvedValueOnce({ briefing: "You have 2 overdue invoices." });
    render(<AiBriefingCard agencyId="a1" />);

    expect(await screen.findByText("You have 2 overdue invoices.")).toBeInTheDocument();
    // Mount loads cache-first — no forced regeneration.
    expect(mockedGetBriefing).toHaveBeenCalledWith("a1", false);
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

  it("shows a retryable error when the request never reaches the server", async () => {
    mockedGetBriefing.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<AiBriefingCard agencyId="a1" />);

    expect(await screen.findByText("Couldn't reach the server. Try refreshing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeEnabled();
  });

  it("renders a briefing streamed from the server render without fetching again", async () => {
    await renderStreamed(Promise.resolve({ briefing: "Streamed briefing." }));

    expect(await screen.findByText("Streamed briefing.", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(mockedGetBriefing).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeEnabled();
  });

  it("shows 'Thinking…' while the streamed briefing is on its way", async () => {
    let resolve!: (value: { briefing: string }) => void;
    const initial = new Promise<{ briefing: string }>((r) => {
      resolve = r;
    });
    await renderStreamed(initial);
    expect(screen.getAllByText("Thinking…")).not.toHaveLength(0);

    await act(async () => resolve({ briefing: "Arrived." }));
    expect(await screen.findByText("Arrived.", undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it("handles a streamed not-configured result, and Refresh on a streamed card forces regeneration", async () => {
    const { unmount } = await renderStreamed(Promise.resolve({ error: "x", notConfigured: true }));
    expect(screen.getByText("AI isn't configured for this environment yet.")).toBeInTheDocument();
    unmount();

    mockedGetBriefing.mockResolvedValueOnce({ error: "Over budget" });
    const user = userEvent.setup();
    await renderStreamed(Promise.resolve({ briefing: "Keep me." }));
    await screen.findByText("Keep me.", undefined, { timeout: 5000 });
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    expect(mockedGetBriefing).toHaveBeenCalledWith("a1", true);
    // A failed refresh keeps the briefing that was already there.
    expect(await screen.findByText("Over budget")).toBeInTheDocument();
    expect(screen.getByText("Keep me.")).toBeInTheDocument();
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
    // Refresh must force regeneration, not just re-read the same cached day.
    expect(mockedGetBriefing).toHaveBeenNthCalledWith(2, "a1", true);
  });
});

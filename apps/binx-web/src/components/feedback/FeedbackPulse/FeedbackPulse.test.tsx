import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/app/(app)/feedback/actions", () => ({
  submitFeedbackAction: vi.fn(),
  answerPulseAction: vi.fn(),
  dismissPulseAction: vi.fn(),
}));
vi.mock("@/app/(app)/actions", () => ({ updateTutorialProgressAction: vi.fn() }));

import { answerPulseAction, dismissPulseAction } from "@/app/(app)/feedback/actions";
import FeedbackProvider from "@/components/feedback/FeedbackProvider/FeedbackProvider";
import TutorialProvider from "@/components/tutorial/TutorialProvider/TutorialProvider";

import FeedbackPulse, { PULSE_DELAY_MS } from "./FeedbackPulse";

const mockedAnswer = vi.mocked(answerPulseAction);
const mockedDismiss = vi.mocked(dismissPulseAction);

function renderPulse(pulseKey: string | null, { tourCompleted = true } = {}) {
  return render(
    <TutorialProvider initialProgress={{ tour_completed: tourCompleted, dismissed_popups: [] }}>
      <FeedbackProvider surface="app" agencyId="a1">
        <FeedbackPulse pulseKey={pulseKey} />
      </FeedbackProvider>
    </TutorialProvider>,
  );
}

function settle() {
  act(() => {
    vi.advanceTimersByTime(PULSE_DELAY_MS);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockedAnswer.mockResolvedValue({ feedback: { id: "f1" } as never });
  mockedDismiss.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FeedbackPulse", () => {
  it("shows nothing when no check-in is due", () => {
    renderPulse(null);
    settle();
    expect(screen.queryByRole("region", { name: "Quick check-in" })).not.toBeInTheDocument();
  });

  it("waits for the page to settle before asking", () => {
    renderPulse("first-week");
    expect(screen.queryByRole("region", { name: "Quick check-in" })).not.toBeInTheDocument();
    settle();
    expect(screen.getByRole("region", { name: "Quick check-in" })).toHaveTextContent(
      "How's your first week going?",
    );
  });

  it("stays out of the way while the welcome tour is open", () => {
    renderPulse("first-week", { tourCompleted: false });
    settle();
    expect(screen.queryByRole("region", { name: "Quick check-in" })).not.toBeInTheDocument();
  });

  it("sends a score with an optional comment", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPulse("first-week");
    settle();

    await user.click(screen.getByRole("button", { name: /2 of 5/i }));
    await user.type(screen.getByRole("textbox", { name: /what would make it better/i }), "Faster invoices");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mockedAnswer).toHaveBeenCalledWith(
      "first-week",
      expect.objectContaining({
        surface: "app",
        agencyId: "a1",
        rating: 2,
        message: "Faster invoices",
        pagePath: "/dashboard",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/thank you/i);
  });

  it("dismissing records it so the milestone doesn't come back", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPulse("first-month");
    settle();
    expect(screen.getByText("A month in — how's it going?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss check-in" }));
    expect(mockedDismiss).toHaveBeenCalledWith("first-month");
    expect(screen.queryByRole("region", { name: "Quick check-in" })).not.toBeInTheDocument();
  });

  it("keeps the card open with an error if saving fails", async () => {
    mockedAnswer.mockResolvedValueOnce({ error: "Unable to save your answer. Please try again." });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPulse("first-week");
    settle();
    await user.click(screen.getByRole("button", { name: /5 of 5/i }));
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to save/i);
  });
});

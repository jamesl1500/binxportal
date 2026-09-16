import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({ updateTutorialProgressAction: vi.fn() }));

import { updateTutorialProgressAction } from "@/app/(app)/actions";
import TutorialProvider, { useTutorial } from "./TutorialProvider";

const mockedUpdate = vi.mocked(updateTutorialProgressAction);

/** A minimal consumer exercising every piece of useTutorial()'s surface. */
function Consumer() {
  const { isTourOpen, openTour, closeTour, tourCompleted, markTourComplete, isPopupDismissed, dismissPopup } =
    useTutorial();

  return (
    <div>
      <p>tour open: {String(isTourOpen)}</p>
      <p>tour completed: {String(tourCompleted)}</p>
      <p>clients-new dismissed: {String(isPopupDismissed("clients-new"))}</p>
      <button onClick={openTour}>open</button>
      <button onClick={closeTour}>close</button>
      <button onClick={markTourComplete}>complete</button>
      <button onClick={() => dismissPopup("clients-new")}>dismiss</button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUpdate.mockResolvedValue({});
});

describe("TutorialProvider", () => {
  it("auto-opens the tour when the server says it hasn't been completed", () => {
    render(
      <TutorialProvider initialProgress={{ tour_completed: false, dismissed_popups: [] }}>
        <Consumer />
      </TutorialProvider>,
    );
    expect(screen.getByText("tour open: true")).toBeInTheDocument();
  });

  it("does not auto-open when the tour is already completed", () => {
    render(
      <TutorialProvider initialProgress={{ tour_completed: true, dismissed_popups: [] }}>
        <Consumer />
      </TutorialProvider>,
    );
    expect(screen.getByText("tour open: false")).toBeInTheDocument();
  });

  it("opens and closes via openTour/closeTour", async () => {
    const user = userEvent.setup();
    render(
      <TutorialProvider initialProgress={{ tour_completed: true, dismissed_popups: [] }}>
        <Consumer />
      </TutorialProvider>,
    );

    await user.click(screen.getByText("open"));
    expect(screen.getByText("tour open: true")).toBeInTheDocument();

    await user.click(screen.getByText("close"));
    expect(screen.getByText("tour open: false")).toBeInTheDocument();
  });

  it("marks the tour complete and persists it in the background", async () => {
    const user = userEvent.setup();
    render(
      <TutorialProvider initialProgress={{ tour_completed: false, dismissed_popups: [] }}>
        <Consumer />
      </TutorialProvider>,
    );

    await user.click(screen.getByText("complete"));
    expect(screen.getByText("tour completed: true")).toBeInTheDocument();

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ tour_completed: true, dismissed_popups: [] }),
    );
  });

  it("does not persist on the initial render — only on an actual change", () => {
    render(
      <TutorialProvider initialProgress={{ tour_completed: false, dismissed_popups: [] }}>
        <Consumer />
      </TutorialProvider>,
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("dismisses a popup, is idempotent, and persists it", async () => {
    const user = userEvent.setup();
    render(
      <TutorialProvider initialProgress={{ tour_completed: true, dismissed_popups: [] }}>
        <Consumer />
      </TutorialProvider>,
    );

    expect(screen.getByText("clients-new dismissed: false")).toBeInTheDocument();

    await user.click(screen.getByText("dismiss"));
    expect(screen.getByText("clients-new dismissed: true")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ tour_completed: true, dismissed_popups: ["clients-new"] }),
    );

    mockedUpdate.mockClear();
    await user.click(screen.getByText("dismiss"));
    // Already dismissed — state doesn't change, so no redundant save.
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("throws when useTutorial is used outside a TutorialProvider", () => {
    const BareConsumer = () => {
      useTutorial();
      return null;
    };
    // Suppress React's expected error-boundary console noise for this case.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<BareConsumer />)).toThrow("useTutorial must be used within a TutorialProvider");
    spy.mockRestore();
  });
});

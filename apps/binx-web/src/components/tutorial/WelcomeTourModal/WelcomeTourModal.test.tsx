import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedCloseTour = vi.fn();
const mockedMarkTourComplete = vi.fn();
let isTourOpen = true;

vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({
    isTourOpen,
    closeTour: mockedCloseTour,
    markTourComplete: mockedMarkTourComplete,
  }),
}));

import WelcomeTourModal from "./WelcomeTourModal";

beforeEach(() => {
  vi.clearAllMocks();
  isTourOpen = true;
});

describe("WelcomeTourModal", () => {
  it("renders nothing when closed", () => {
    isTourOpen = false;
    render(<WelcomeTourModal />);
    expect(screen.queryByRole("heading", { name: "Welcome to Binx" })).not.toBeInTheDocument();
  });

  it("opens on the first slide", async () => {
    render(<WelcomeTourModal />);
    expect(await screen.findByRole("heading", { name: "Welcome to Binx" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("advances through slides with Next and back with Back", async () => {
    const user = userEvent.setup();
    render(<WelcomeTourModal />);
    await screen.findByRole("heading", { name: "Welcome to Binx" });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Your dashboard" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Welcome to Binx" })).toBeInTheDocument();
  });

  it("shows 'Get started' on the last slide and completes the tour", async () => {
    const user = userEvent.setup();
    render(<WelcomeTourModal />);
    await screen.findByRole("heading", { name: "Welcome to Binx" });

    // 9 slides total — click Next 8 times to reach the last one.
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByRole("button", { name: /^(Next|Get started)$/ }));
    }
    expect(screen.getByRole("heading", { name: "You're all set" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Get started" }));
    expect(mockedMarkTourComplete).toHaveBeenCalledOnce();
    expect(mockedCloseTour).toHaveBeenCalledOnce();
  });

  it("marks the tour complete when skipped", async () => {
    const user = userEvent.setup();
    render(<WelcomeTourModal />);
    await screen.findByRole("heading", { name: "Welcome to Binx" });

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(mockedMarkTourComplete).toHaveBeenCalledOnce();
    expect(mockedCloseTour).toHaveBeenCalledOnce();
  });
});

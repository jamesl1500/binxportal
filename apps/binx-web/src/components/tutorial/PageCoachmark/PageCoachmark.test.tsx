import { useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedDismissPopup = vi.fn();
let dismissedPopups: string[] = [];

vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({
    isPopupDismissed: (id: string) => dismissedPopups.includes(id),
    dismissPopup: mockedDismissPopup,
  }),
}));

import PageCoachmark from "./PageCoachmark";

function Harness({ id = "test-popup" }: { id?: string }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div>
      <button ref={anchorRef} type="button">
        Target
      </button>
      <PageCoachmark id={id} anchorRef={anchorRef} title="Test title" body="Test body" />
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dismissedPopups = [];
});

describe("PageCoachmark", () => {
  it("shows the callout when not dismissed", async () => {
    render(<Harness />);
    expect(await screen.findByText("Test title")).toBeInTheDocument();
    expect(screen.getByText("Test body")).toBeInTheDocument();
  });

  it("renders nothing when already dismissed", () => {
    dismissedPopups = ["test-popup"];
    render(<Harness />);
    expect(screen.queryByText("Test title")).not.toBeInTheDocument();
  });

  it("dismisses when 'Got it' is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByText("Test title");

    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(mockedDismissPopup).toHaveBeenCalledWith("test-popup");
  });
});

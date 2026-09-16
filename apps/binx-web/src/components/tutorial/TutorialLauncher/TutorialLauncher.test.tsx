import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedOpenTour = vi.fn();
vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({ openTour: mockedOpenTour }),
}));

import TutorialLauncher from "./TutorialLauncher";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TutorialLauncher", () => {
  it("opens the tour when clicked", async () => {
    const user = userEvent.setup();
    render(<TutorialLauncher />);

    await user.click(screen.getByRole("button", { name: "Open the guided tour" }));

    expect(mockedOpenTour).toHaveBeenCalledOnce();
  });
});

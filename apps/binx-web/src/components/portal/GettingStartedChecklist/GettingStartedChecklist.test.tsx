import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({ updateTutorialProgressAction: vi.fn() }));

import { updateTutorialProgressAction } from "@/app/(app)/actions";
import PortalOnboardingProvider, {
  usePortalOnboarding,
} from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import { PORTAL_STEP_IDS, PORTAL_TOUR_ID, type ChecklistStep } from "@/lib/portal-insights";
import GettingStartedChecklist from "./GettingStartedChecklist";

const mockedSave = vi.mocked(updateTutorialProgressAction);

const STEPS: ChecklistStep[] = [
  { id: "tour", title: "Take the two-minute tour", description: "", done: false, action: { type: "tour" } },
  {
    id: "projects",
    title: "Check in on your projects",
    description: "",
    done: false,
    action: { type: "link", href: "/portal/projects", markId: PORTAL_STEP_IDS.projects },
  },
  { id: "meeting", title: "Book a call", description: "", done: true, action: { type: "link", href: "/portal/meetings" } },
];

const TourProbe = () => <span data-testid="tour">{String(usePortalOnboarding().isTourOpen)}</span>;

function renderChecklist(dismissed: string[] = [PORTAL_TOUR_ID], steps = STEPS) {
  return render(
    <PortalOnboardingProvider initialProgress={{ tour_completed: true, dismissed_popups: dismissed }}>
      <GettingStartedChecklist steps={steps} />
      <TourProbe />
    </PortalOnboardingProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GettingStartedChecklist", () => {
  it("counts done steps, including ones completed by a previous visit", () => {
    renderChecklist();
    // The tour was dismissed already + "Book a call" is done from data.
    expect(screen.getByText("2 of 3 done")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Getting started progress" })).toHaveAttribute(
      "aria-valuenow",
      "67",
    );
    expect(screen.getByRole("link", { name: /Book a call\s*\(done\)/ })).toBeInTheDocument();
  });

  it("ticks off a click-through step and persists it, keeping the staff tour flag", async () => {
    const user = userEvent.setup();
    renderChecklist();

    await user.click(screen.getByRole("link", { name: /Check in on your projects/ }));

    expect(screen.getByText("You're all set up")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith({
        tour_completed: true,
        dismissed_popups: [PORTAL_TOUR_ID, PORTAL_STEP_IDS.projects],
      }),
    );
  });

  it("leaves the tour open for a client who has never seen it", () => {
    renderChecklist([]);
    expect(screen.getByTestId("tour")).toHaveTextContent("true");
  });

  it("reopens the tour on demand", async () => {
    const user = userEvent.setup();
    renderChecklist([PORTAL_TOUR_ID], [{ ...STEPS[0], title: "Replay the tour" }, STEPS[1]]);
    expect(screen.getByTestId("tour")).toHaveTextContent("false");

    await user.click(screen.getByRole("button", { name: /Replay the tour/ }));
    expect(screen.getByTestId("tour")).toHaveTextContent("true");
  });

  it("hides for good once dismissed", async () => {
    const user = userEvent.setup();
    renderChecklist();

    await user.click(screen.getByRole("button", { name: "Hide getting started checklist" }));
    expect(screen.queryByText("Getting started")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith(
        expect.objectContaining({ dismissed_popups: [PORTAL_TOUR_ID, "portal-checklist"] }),
      ),
    );
  });
});

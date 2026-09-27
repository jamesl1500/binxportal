import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/actions", () => ({ updateTutorialProgressAction: vi.fn() }));

import { updateTutorialProgressAction } from "@/app/(app)/actions";
import PortalOnboardingProvider from "@/components/portal/PortalOnboardingProvider/PortalOnboardingProvider";
import { PORTAL_TOUR_ID } from "@/lib/portal-insights";
import PortalWelcomeTour from "./PortalWelcomeTour";

const mockedSave = vi.mocked(updateTutorialProgressAction);

function renderTour(dismissed: string[] = [], logoSrc: string | null = null) {
  return render(
    <PortalOnboardingProvider initialProgress={{ tour_completed: false, dismissed_popups: dismissed }}>
      <PortalWelcomeTour agencyName="Northlight" clientName="Fjord & Field" contactFirstName="Priya" logoSrc={logoSrc} />
    </PortalOnboardingProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PortalWelcomeTour", () => {
  it("opens on a first visit, greeting the contact by name", async () => {
    renderTour();
    expect(await screen.findByRole("heading", { name: "Welcome, Priya" })).toBeInTheDocument();
    expect(screen.getByText("Fjord & Field × Northlight")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("stays closed once it's been seen", () => {
    renderTour([PORTAL_TOUR_ID]);
    expect(screen.queryByRole("heading", { name: "Welcome, Priya" })).not.toBeInTheDocument();
  });

  it("walks forward and back, then finishes and records it — without touching the staff tour flag", async () => {
    const user = userEvent.setup();
    renderTour();
    await screen.findByRole("heading", { name: "Welcome, Priya" });

    await user.click(screen.getByRole("button", { name: "Show me around" }));
    expect(screen.getByRole("heading", { name: "Everything that needs you, first" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Welcome, Priya" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show me around" }));
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(screen.getByRole("heading", { name: "You're ready to go" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Get started" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "You're ready to go" })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith({ tour_completed: false, dismissed_popups: [PORTAL_TOUR_ID] }),
    );
  });

  it("can be skipped", async () => {
    const user = userEvent.setup();
    renderTour();
    await screen.findByRole("heading", { name: "Welcome, Priya" });

    await user.click(screen.getByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
  });
});

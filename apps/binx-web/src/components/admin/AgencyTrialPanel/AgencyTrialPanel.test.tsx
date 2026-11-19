import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/admin/actions", () => ({
  grantTrialAction: vi.fn(),
  endTrialAction: vi.fn(),
}));

import { endTrialAction, grantTrialAction } from "@/app/(app)/admin/actions";

import AgencyTrialPanel from "./AgencyTrialPanel";

const BASE = {
  agencyId: "a1",
  agencyName: "Pixel Forge",
  trialing: false,
  trialPlanName: null,
  trialEndsAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(grantTrialAction).mockResolvedValue({ message: "Pixel Forge is on a Scale trial" });
  vi.mocked(endTrialAction).mockResolvedValue({ message: "Ended" });
});

describe("AgencyTrialPanel", () => {
  it("grants a trial with the chosen plan, days and reason", async () => {
    const user = userEvent.setup();
    render(<AgencyTrialPanel {...BASE} />);
    expect(screen.getByText("Not on a trial.")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Plan" }), "scale");
    const days = screen.getByRole("spinbutton", { name: "Days" });
    await user.clear(days);
    await user.type(days, "30");
    await user.type(screen.getByRole("textbox", { name: /reason/i }), "Migration help");
    await user.click(screen.getByRole("button", { name: "Give trial" }));

    expect(grantTrialAction).toHaveBeenCalledWith("a1", {
      plan: "scale",
      days: 30,
      reason: "Migration help",
    });
    expect(await screen.findByText("Pixel Forge is on a Scale trial")).toBeInTheDocument();
  });

  it("can't trial the Free plan", () => {
    render(<AgencyTrialPanel {...BASE} />);
    const options = within(screen.getByRole("combobox", { name: "Plan" })).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Starter", "Pro", "Scale"]);
  });

  it("ends a running trial after confirming", async () => {
    const user = userEvent.setup();
    render(
      <AgencyTrialPanel
        {...BASE}
        trialing
        trialPlanName="Pro"
        trialEndsAt="2026-12-01T12:00:00Z"
      />,
    );
    expect(screen.getByRole("button", { name: "Set new trial" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "End trial now" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "End trial" }));
    expect(endTrialAction).toHaveBeenCalledWith("a1");
  });
});

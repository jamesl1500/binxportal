import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/account/actions", () => ({
  updatePrivacySettingsAction: vi.fn(),
}));

import { updatePrivacySettingsAction } from "@/app/(app)/account/actions";
import type { PrivacySettings } from "@/lib/users";

import PrivacySettingsForm from "./PrivacySettingsForm";

const mockedUpdatePrivacySettingsAction = vi.mocked(updatePrivacySettingsAction);

const settings: PrivacySettings = {
  profile_visibility: "team",
  show_email_to_team: true,
  show_phone_to_team: false,
  activity_status_visible: true,
  analytics_opt_out: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PrivacySettingsForm", () => {
  it("renders the visibility select and a switch per toggle, reflecting the initial values", () => {
    render(<PrivacySettingsForm settings={settings} />);

    expect(screen.getByLabelText("Profile visibility")).toHaveValue("team");
    expect(screen.getByRole("switch", { name: "Show email to team" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Show phone number to team" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("saves the selected visibility and every toggle's current value", async () => {
    mockedUpdatePrivacySettingsAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<PrivacySettingsForm settings={settings} />);

    await user.selectOptions(screen.getByLabelText("Profile visibility"), "private");
    await user.click(screen.getByRole("switch", { name: "Show phone number to team" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Privacy settings saved.")).toBeInTheDocument();
    expect(mockedUpdatePrivacySettingsAction).toHaveBeenCalledWith({
      ...settings,
      profile_visibility: "private",
      show_phone_to_team: true,
    });
  });

  it("shows the server error on failure", async () => {
    mockedUpdatePrivacySettingsAction.mockResolvedValueOnce({ error: "Unable to save privacy settings" });
    const user = userEvent.setup();
    render(<PrivacySettingsForm settings={settings} />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Unable to save privacy settings")).toBeInTheDocument();
  });
});

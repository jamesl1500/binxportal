import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/account/actions", () => ({
  updateNotificationSettingsAction: vi.fn(),
}));

import { updateNotificationSettingsAction } from "@/app/(app)/account/actions";
import type { NotificationSettings } from "@/lib/users";

import NotificationSettingsForm from "./NotificationSettingsForm";

const mockedUpdateNotificationSettingsAction = vi.mocked(updateNotificationSettingsAction);

const settings: NotificationSettings = {
  email_product_updates: true,
  email_client_activity: true,
  email_team_mentions: false,
  email_weekly_digest: false,
  email_security_alerts: true,
  inapp_team: true,
  inapp_invoicing: true,
  inapp_projects: false,
  inapp_messages: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotificationSettingsForm", () => {
  it("renders a switch per setting, reflecting the initial values", () => {
    render(<NotificationSettingsForm settings={settings} />);

    expect(screen.getByRole("switch", { name: "Product updates" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Team mentions" })).toHaveAttribute("aria-checked", "false");
  });

  it("toggling a switch does not save until Save changes is clicked", async () => {
    const user = userEvent.setup();
    render(<NotificationSettingsForm settings={settings} />);

    await user.click(screen.getByRole("switch", { name: "Team mentions" }));

    expect(screen.getByRole("switch", { name: "Team mentions" })).toHaveAttribute("aria-checked", "true");
    expect(mockedUpdateNotificationSettingsAction).not.toHaveBeenCalled();
  });

  it("saves every toggle's current value, including the one just flipped", async () => {
    mockedUpdateNotificationSettingsAction.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<NotificationSettingsForm settings={settings} />);

    await user.click(screen.getByRole("switch", { name: "Team mentions" }));
    await user.click(screen.getByRole("switch", { name: "Product updates" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Notification settings saved.")).toBeInTheDocument();
    expect(mockedUpdateNotificationSettingsAction).toHaveBeenCalledWith({
      ...settings,
      email_team_mentions: true,
      email_product_updates: false,
    });
  });

  it("shows the server error on failure", async () => {
    mockedUpdateNotificationSettingsAction.mockResolvedValueOnce({ error: "Unable to save notification settings" });
    const user = userEvent.setup();
    render(<NotificationSettingsForm settings={settings} />);

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Unable to save notification settings")).toBeInTheDocument();
  });
});

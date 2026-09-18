import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/settings/meetings/actions", () => ({ updateMeetingSettingsAction: vi.fn() }));

import { updateMeetingSettingsAction } from "@/app/(app)/settings/meetings/actions";
import MeetingSettingsForm from "./MeetingSettingsForm";

const mocked = vi.mocked(updateMeetingSettingsAction);

const settings = {
  agency_id: "a1",
  timezone: "America/New_York",
  slot_minutes: 30,
  booking_notice_hours: 24,
  booking_window_days: 30,
  self_booking_enabled: true,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("MeetingSettingsForm", () => {
  it("shows a read-only summary for a non-manager", () => {
    render(<MeetingSettingsForm agencyId="a1" settings={settings} canManage={false} />);
    expect(screen.getByText(/only an owner or admin/i)).toBeInTheDocument();
    expect(screen.getByText("America/New_York")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("prefills the editable form for a manager", () => {
    render(<MeetingSettingsForm agencyId="a1" settings={settings} canManage />);
    expect(screen.getByLabelText("Timezone")).toHaveValue("America/New_York");
    expect(screen.getByLabelText("Slot length (minutes)")).toHaveValue(30);
    expect(screen.getByLabelText("Booking notice (hours)")).toHaveValue(24);
    expect(screen.getByLabelText("Booking window (days)")).toHaveValue(30);
    expect(screen.getByRole("switch", { name: "Self-service booking" })).toHaveAttribute("data-checked", "");
  });

  it("saves the current settings, including the self-booking toggle", async () => {
    render(<MeetingSettingsForm agencyId="a1" settings={settings} canManage />);
    await userEvent.click(screen.getByRole("switch", { name: "Self-service booking" }));
    await userEvent.click(screen.getByRole("button", { name: "Save meeting settings" }));

    expect(mocked).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        timezone: "America/New_York",
        slot_minutes: 30,
        booking_notice_hours: 24,
        booking_window_days: 30,
        self_booking_enabled: false,
      }),
    );
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("blocks an out-of-range slot length", async () => {
    render(<MeetingSettingsForm agencyId="a1" settings={settings} canManage />);
    const slotMinutes = screen.getByLabelText("Slot length (minutes)");
    await userEvent.clear(slotMinutes);
    await userEvent.type(slotMinutes, "1000");
    await userEvent.click(screen.getByRole("button", { name: "Save meeting settings" }));

    // Numeric range fields rely on the HTML min/max plus zod's silent
    // block on submit, same as BillingSettingsForm's numberPadding /
    // defaultDueDays — no inline message, just no submission.
    expect(mocked).not.toHaveBeenCalled();
  });

  it("surfaces a server error", async () => {
    mocked.mockResolvedValueOnce({ error: "Not permitted" } as never);
    render(<MeetingSettingsForm agencyId="a1" settings={settings} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Save meeting settings" }));
    expect(await screen.findByText("Not permitted")).toBeInTheDocument();
  });
});

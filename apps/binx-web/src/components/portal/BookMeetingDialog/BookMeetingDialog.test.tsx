import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(portal)/portal/meetings/actions", () => ({
  getPortalAvailableSlotsAction: vi.fn(),
  bookPortalMeetingAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { bookPortalMeetingAction, getPortalAvailableSlotsAction } from "@/app/(portal)/portal/meetings/actions";

import BookMeetingDialog from "./BookMeetingDialog";

const mockedGetSlots = vi.mocked(getPortalAvailableSlotsAction);
const mockedBook = vi.mocked(bookPortalMeetingAction);

// Two slots ~30 days apart (distinct calendar days under any real timezone
// offset), each solidly mid-day in UTC so a local-timezone shift doesn't
// push it across a date boundary in CI.
const SLOT_A = { starts_at: "2026-01-05T15:00:00Z", ends_at: "2026-01-05T15:30:00Z" };
const SLOT_B = { starts_at: "2026-02-05T15:00:00Z", ends_at: "2026-02-05T15:30:00Z" };

/** The day/time-grid buttons carry no fixed accessible name (their label is
 * locale/timezone-formatted) — filter out the buttons whose label IS known
 * and fixed to isolate them. */
function gridButtons(knownLabels: string[]) {
  const dialog = screen.getByRole("dialog");
  return within(dialog)
    .getAllByRole("button")
    .filter((button) => !knownLabels.includes(button.textContent?.trim() ?? ""));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetSlots.mockResolvedValue({ slots: [SLOT_A, SLOT_B] } as never);
  mockedBook.mockResolvedValue({ meeting: { id: "m1", starts_at: SLOT_A.starts_at } } as never);
});

describe("BookMeetingDialog", () => {
  it("loads open days when opened", async () => {
    const user = userEvent.setup();
    render(<BookMeetingDialog />);

    await user.click(screen.getByRole("button", { name: "Book a meeting" }));

    expect(mockedGetSlots).toHaveBeenCalled();
    await screen.findByText(/pick a day/i);
    expect(gridButtons(["Cancel"])).toHaveLength(2);
  });

  it("shows a message when there are no open times", async () => {
    mockedGetSlots.mockResolvedValueOnce({ slots: [] } as never);
    const user = userEvent.setup();
    render(<BookMeetingDialog />);

    await user.click(screen.getByRole("button", { name: "Book a meeting" }));
    expect(await screen.findByText(/no open times/i)).toBeInTheDocument();
  });

  it("walks day -> time -> confirm and books the chosen slot", async () => {
    const user = userEvent.setup();
    render(<BookMeetingDialog />);

    await user.click(screen.getByRole("button", { name: "Book a meeting" }));
    await screen.findByText(/pick a day/i);
    await user.click(gridButtons(["Cancel"])[0]);

    await screen.findByText(/pick a time/i);
    const timeButtons = gridButtons(["Back"]);
    expect(timeButtons).toHaveLength(1); // one slot per day in this fixture
    await user.click(timeButtons[0]);

    await screen.findByText(/confirm your meeting/i);
    await user.type(screen.getByLabelText(/what's this about/i), "Kickoff");
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(mockedBook).toHaveBeenCalledWith(
      expect.objectContaining({ starts_at: SLOT_A.starts_at, title: "Kickoff" }),
    );
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.queryByText(/confirm your meeting/i)).not.toBeInTheDocument();
  });

  it("recovers from a 409 by dropping back to the time step with fresh slots", async () => {
    mockedBook.mockResolvedValueOnce({ error: "Taken", status: 409 } as never);
    // Re-fetch after the conflict returns only the remaining slot.
    mockedGetSlots.mockResolvedValueOnce({ slots: [SLOT_A, SLOT_B] } as never).mockResolvedValueOnce({
      slots: [SLOT_B],
    } as never);

    const user = userEvent.setup();
    render(<BookMeetingDialog />);

    await user.click(screen.getByRole("button", { name: "Book a meeting" }));
    await screen.findByText(/pick a day/i);
    await user.click(gridButtons(["Cancel"])[0]);
    await screen.findByText(/pick a time/i);
    await user.click(gridButtons(["Back"])[0]);
    await screen.findByText(/confirm your meeting/i);
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));

    expect(await screen.findByText(/just booked/i)).toBeInTheDocument();
    expect(mockedGetSlots).toHaveBeenCalledTimes(2);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("resets back to the day step when closed and reopened mid-flow", async () => {
    const user = userEvent.setup();
    render(<BookMeetingDialog />);

    await user.click(screen.getByRole("button", { name: "Book a meeting" }));
    await screen.findByText(/pick a day/i);
    await user.click(gridButtons(["Cancel"])[0]);
    await screen.findByText(/pick a time/i);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Book a meeting" }));
    expect(await screen.findByText(/pick a day/i)).toBeInTheDocument();
    expect(screen.queryByText(/pick a time/i)).not.toBeInTheDocument();
  });
});

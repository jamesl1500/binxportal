import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(portal)/portal/meetings/actions", () => ({
  cancelPortalMeetingAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { cancelPortalMeetingAction } from "@/app/(portal)/portal/meetings/actions";
import type { PortalMeeting } from "@/lib/portal";

import PortalMeetingsList from "./PortalMeetingsList";

const mockedCancel = vi.mocked(cancelPortalMeetingAction);

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function makeMeeting(overrides: Partial<PortalMeeting>): PortalMeeting {
  return {
    id: "m1",
    agency_id: "a1",
    client_id: "c1",
    client_name: "Globex",
    project_id: null,
    project_name: null,
    title: "Kickoff",
    notes: null,
    location: null,
    starts_at: FUTURE,
    ends_at: FUTURE,
    status: "scheduled",
    created_by_kind: "agency_member",
    created_by_name: "James",
    cancelled_at: null,
    cancelled_by_kind: null,
    cancelled_by_name: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as PortalMeeting;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCancel.mockResolvedValue({} as never);
});

describe("PortalMeetingsList", () => {
  it("shows a Cancel button on an upcoming, still-scheduled meeting", () => {
    render(<PortalMeetingsList meetings={[makeMeeting({ starts_at: FUTURE, status: "scheduled" })]} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("hides Cancel on a past meeting", () => {
    render(<PortalMeetingsList meetings={[makeMeeting({ starts_at: PAST, status: "scheduled" })]} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("hides Cancel on an already-cancelled meeting", () => {
    render(<PortalMeetingsList meetings={[makeMeeting({ starts_at: FUTURE, status: "cancelled" })]} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("distinguishes who booked the meeting", () => {
    render(
      <PortalMeetingsList
        meetings={[
          makeMeeting({ id: "a", starts_at: FUTURE, created_by_kind: "client" }),
          makeMeeting({ id: "b", starts_at: FUTURE, created_by_kind: "agency_member" }),
        ]}
      />,
    );
    expect(screen.getByText("You booked this")).toBeInTheDocument();
    expect(screen.getByText("Scheduled for you")).toBeInTheDocument();
  });

  it("cancels a meeting and refreshes the route", async () => {
    const user = userEvent.setup();
    render(<PortalMeetingsList meetings={[makeMeeting({ id: "m1", starts_at: FUTURE })]} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockedCancel).toHaveBeenCalledWith("m1");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("surfaces a cancel error", async () => {
    mockedCancel.mockResolvedValueOnce({ error: "Not permitted" } as never);
    const user = userEvent.setup();
    render(<PortalMeetingsList meetings={[makeMeeting({ id: "m1", starts_at: FUTURE })]} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Not permitted")).toBeInTheDocument();
  });
});

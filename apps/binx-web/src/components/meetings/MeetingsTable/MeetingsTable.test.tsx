import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

vi.mock("@/app/(app)/meetings/actions", () => ({
  cancelMeetingAction: vi.fn(),
  createMeetingAction: vi.fn(),
  updateMeetingAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { cancelMeetingAction, updateMeetingAction } from "@/app/(app)/meetings/actions";
import type { Meeting } from "@/lib/meetings";

import MeetingsTable from "./MeetingsTable";

const mockedCancel = vi.mocked(cancelMeetingAction);
const mockedUpdate = vi.mocked(updateMeetingAction);

const CLIENTS = [{ id: "c1", name: "Globex" }];
const PROJECTS = [{ id: "p1", name: "Website relaunch", client_id: "c1" }];

// Computed relative to whenever the suite actually runs, not hardcoded —
// this file caught a real bug earlier in this project when hardcoded dates
// silently ended up in the past.
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

function makeMeeting(overrides: Partial<Meeting>): Meeting {
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
  } as Meeting;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCancel.mockResolvedValue({} as never);
  mockedUpdate.mockResolvedValue({ meeting: makeMeeting({}) } as never);
});

describe("MeetingsTable", () => {
  it("shows an empty state with no meetings", () => {
    render(<MeetingsTable agencyId="a1" meetings={[]} clients={CLIENTS} projects={PROJECTS} />);
    expect(screen.getByText("No meetings yet.")).toBeInTheDocument();
  });

  it("renders upcoming meetings by default", () => {
    render(
      <MeetingsTable
        agencyId="a1"
        clients={CLIENTS}
        projects={PROJECTS}
        meetings={[
          makeMeeting({ id: "future", title: "Future meeting", starts_at: FUTURE }),
          makeMeeting({ id: "past", title: "Past meeting", starts_at: PAST }),
        ]}
      />,
    );
    expect(screen.getByText("Future meeting")).toBeInTheDocument();
    expect(screen.queryByText("Past meeting")).not.toBeInTheDocument();
  });

  it("switches to the Past filter", async () => {
    const user = userEvent.setup();
    render(
      <MeetingsTable
        agencyId="a1"
        clients={CLIENTS}
        projects={PROJECTS}
        meetings={[
          makeMeeting({ id: "future", title: "Future meeting", starts_at: FUTURE }),
          makeMeeting({ id: "past", title: "Past meeting", starts_at: PAST }),
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Past" }));
    expect(screen.getByText("Past meeting")).toBeInTheDocument();
    expect(screen.queryByText("Future meeting")).not.toBeInTheDocument();
  });

  it("excludes cancelled meetings from Upcoming, and shows them under Cancelled", async () => {
    const user = userEvent.setup();
    render(
      <MeetingsTable
        agencyId="a1"
        clients={CLIENTS}
        projects={PROJECTS}
        meetings={[makeMeeting({ id: "c1", title: "Called off", status: "cancelled", starts_at: FUTURE })]}
      />,
    );
    expect(screen.queryByText("Called off")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelled" }));
    expect(screen.getByText("Called off")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit meeting" })).not.toBeInTheDocument();
  });

  it("hides the client column when showClient is false", () => {
    render(
      <MeetingsTable agencyId="a1" clients={CLIENTS} projects={PROJECTS} meetings={[makeMeeting({})]} showClient={false} />,
    );
    expect(screen.queryByText("Globex")).not.toBeInTheDocument();
  });

  it("links a meeting's project when it has one", () => {
    render(
      <MeetingsTable
        agencyId="a1"
        clients={CLIENTS}
        projects={PROJECTS}
        meetings={[makeMeeting({ project_id: "p1", project_name: "Website relaunch" })]}
      />,
    );
    expect(screen.getByText("Website relaunch")).toBeInTheDocument();
  });

  it("cancels a meeting and refreshes the route", async () => {
    const user = userEvent.setup();
    render(<MeetingsTable agencyId="a1" clients={CLIENTS} projects={PROJECTS} meetings={[makeMeeting({ id: "m1" })]} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockedCancel).toHaveBeenCalledWith("a1", "m1");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("surfaces a cancel error", async () => {
    mockedCancel.mockResolvedValueOnce({ error: "Not permitted" } as never);
    const user = userEvent.setup();
    render(<MeetingsTable agencyId="a1" clients={CLIENTS} projects={PROJECTS} meetings={[makeMeeting({ id: "m1" })]} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Not permitted")).toBeInTheDocument();
  });

  it("opens the edit dialog, prefilled, for a scheduled meeting", async () => {
    const user = userEvent.setup();
    render(
      <MeetingsTable
        agencyId="a1"
        clients={CLIENTS}
        projects={PROJECTS}
        meetings={[makeMeeting({ id: "m1", title: "Kickoff call" })]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit meeting" }));

    expect(await screen.findByRole("heading", { name: "Edit meeting" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Kickoff call");
  });
});

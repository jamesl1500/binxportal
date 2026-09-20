import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import type { Meeting } from "@/lib/meetings";

import UpcomingMeetingsCard from "./UpcomingMeetingsCard";

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
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 86_400_000).toISOString(),
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

describe("UpcomingMeetingsCard", () => {
  it("shows an empty state with no meetings", () => {
    render(<UpcomingMeetingsCard meetings={[]} moreHref="/meetings" />);
    expect(screen.getByText("No upcoming meetings.")).toBeInTheDocument();
  });

  it("renders each meeting's title", () => {
    render(
      <UpcomingMeetingsCard
        meetings={[makeMeeting({ id: "a", title: "Kickoff call" }), makeMeeting({ id: "b", title: "Check-in" })]}
        moreHref="/meetings"
      />,
    );
    expect(screen.getByText("Kickoff call")).toBeInTheDocument();
    expect(screen.getByText("Check-in")).toBeInTheDocument();
  });

  it("hides client/project meta by default", () => {
    render(<UpcomingMeetingsCard meetings={[makeMeeting({ project_name: "Website" })]} moreHref="/meetings" />);
    expect(screen.queryByText("Globex")).not.toBeInTheDocument();
    expect(screen.queryByText("Website")).not.toBeInTheDocument();
  });

  it("shows client and/or project when asked to", () => {
    render(
      <UpcomingMeetingsCard
        meetings={[makeMeeting({ project_name: "Website" })]}
        moreHref="/meetings"
        showClient
        showProject
      />,
    );
    expect(screen.getByText("Globex · Website")).toBeInTheDocument();
  });

  it("caps the list and links the remainder", () => {
    const meetings = Array.from({ length: 6 }, (_, i) => makeMeeting({ id: `m${i}`, title: `Meeting ${i}` }));
    render(<UpcomingMeetingsCard meetings={meetings} limit={4} moreHref="/meetings" />);
    expect(screen.getAllByText(/^Meeting \d$/)).toHaveLength(4);
    const more = screen.getByText("+2 more");
    expect(more).toHaveAttribute("href", "/meetings");
  });
});

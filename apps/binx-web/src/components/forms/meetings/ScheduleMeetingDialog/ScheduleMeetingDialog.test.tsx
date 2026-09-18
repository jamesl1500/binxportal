import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/meetings/actions", () => ({
  createMeetingAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { createMeetingAction } from "@/app/(app)/meetings/actions";

import ScheduleMeetingDialog from "./ScheduleMeetingDialog";

const mockedCreate = vi.mocked(createMeetingAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";
const clients = [{ id: "c1", name: "Acme Co" }];
const projects = [{ id: "p1", name: "Website", client_id: "c1" }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ScheduleMeetingDialog", () => {
  it("opens the dialog when Schedule meeting is clicked", async () => {
    const user = userEvent.setup();
    render(<ScheduleMeetingDialog agencyId={agencyId} clients={clients} projects={projects} />);

    await user.click(screen.getByRole("button", { name: /schedule meeting/i }));

    expect(await screen.findByRole("heading", { name: "Schedule a meeting" })).toBeInTheDocument();
  });

  it("schedules a meeting and closes the dialog, refreshing the route", async () => {
    mockedCreate.mockResolvedValueOnce({
      meeting: {
        id: "m1",
        agency_id: agencyId,
        client_id: "c1",
        client_name: "Acme Co",
        project_id: null,
        project_name: null,
        title: "Kickoff",
        notes: null,
        location: null,
        starts_at: "2026-01-01T15:00:00Z",
        ends_at: "2026-01-01T15:30:00Z",
        status: "scheduled",
        created_by_kind: "agency_member",
        created_by_name: "James",
        cancelled_at: null,
        cancelled_by_kind: null,
        cancelled_by_name: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    });
    const user = userEvent.setup();
    render(<ScheduleMeetingDialog agencyId={agencyId} clients={clients} projects={projects} />);

    await user.click(screen.getByRole("button", { name: /schedule meeting/i }));
    await user.type(screen.getByLabelText("Title"), "Kickoff");
    await user.click(screen.getByRole("button", { name: /^schedule meeting$/i }));

    expect(mockedCreate).toHaveBeenCalledWith(
      agencyId,
      expect.objectContaining({ client_id: "c1", title: "Kickoff" }),
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Schedule a meeting" })).not.toBeInTheDocument();
  });

  it("closes the dialog without scheduling anything when cancelled", async () => {
    const user = userEvent.setup();
    render(<ScheduleMeetingDialog agencyId={agencyId} clients={clients} projects={projects} />);

    await user.click(screen.getByRole("button", { name: /schedule meeting/i }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("heading", { name: "Schedule a meeting" })).not.toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("pre-selects and locks the client when defaultClientId is set", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleMeetingDialog agencyId={agencyId} clients={clients} projects={projects} defaultClientId="c1" />,
    );

    await user.click(screen.getByRole("button", { name: /schedule meeting/i }));

    const clientField = await screen.findByLabelText("Client");
    expect(clientField).toHaveValue("Acme Co");
    expect(clientField).toBeDisabled();
  });
});

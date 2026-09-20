import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/meetings/actions", () => ({
  createMeetingAction: vi.fn(),
  updateMeetingAction: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { updateMeetingAction } from "@/app/(app)/meetings/actions";
import type { Meeting } from "@/lib/meetings";

import EditMeetingDialog from "./EditMeetingDialog";

const mockedUpdate = vi.mocked(updateMeetingAction);

const agencyId = "aaaaaaaa-1111-1111-1111-111111111111";
const clients = [{ id: "c1", name: "Acme Co" }];
const projects = [{ id: "p1", name: "Website", client_id: "c1" }];

const meeting: Meeting = {
  id: "m1",
  agency_id: agencyId,
  client_id: "c1",
  client_name: "Acme Co",
  project_id: "p1",
  project_name: "Website",
  title: "Kickoff call",
  notes: "Bring the brief",
  location: "Zoom",
  starts_at: "2026-06-01T15:00:00Z",
  ends_at: "2026-06-01T15:30:00Z",
  status: "scheduled",
  created_by_kind: "agency_member",
  created_by_name: "James",
  cancelled_at: null,
  cancelled_by_kind: null,
  cancelled_by_name: null,
  created_at: "2026-01-01T00:00:00Z",
} as Meeting;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditMeetingDialog", () => {
  it("opens the dialog with every field prefilled from the meeting", async () => {
    const user = userEvent.setup();
    render(<EditMeetingDialog agencyId={agencyId} meeting={meeting} clients={clients} projects={projects} />);

    await user.click(screen.getByRole("button", { name: "Edit meeting" }));

    expect(await screen.findByRole("heading", { name: "Edit meeting" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Kickoff call");
    expect(screen.getByLabelText("Notes")).toHaveValue("Bring the brief");
    expect(screen.getByLabelText("Location")).toHaveValue("Zoom");
    // Client is always locked in edit mode — reassigning to a different client isn't supported.
    expect(screen.getByLabelText("Client")).toBeDisabled();
    expect(screen.getByLabelText("Client")).toHaveValue("Acme Co");
  });

  it("saves changes and closes the dialog, refreshing the route", async () => {
    mockedUpdate.mockResolvedValueOnce({ meeting: { ...meeting, title: "Renamed" } } as never);
    const user = userEvent.setup();
    render(<EditMeetingDialog agencyId={agencyId} meeting={meeting} clients={clients} projects={projects} />);

    await user.click(screen.getByRole("button", { name: "Edit meeting" }));
    const titleField = await screen.findByLabelText("Title");
    await user.clear(titleField);
    await user.type(titleField, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockedUpdate).toHaveBeenCalledWith(agencyId, "m1", expect.objectContaining({ title: "Renamed" }));
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Edit meeting" })).not.toBeInTheDocument();
  });

  it("closes without saving when cancelled", async () => {
    const user = userEvent.setup();
    render(<EditMeetingDialog agencyId={agencyId} meeting={meeting} clients={clients} projects={projects} />);

    await user.click(screen.getByRole("button", { name: "Edit meeting" }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("heading", { name: "Edit meeting" })).not.toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("surfaces a server error, e.g. a reschedule conflict", async () => {
    mockedUpdate.mockResolvedValueOnce({ error: "That time is no longer available" } as never);
    const user = userEvent.setup();
    render(<EditMeetingDialog agencyId={agencyId} meeting={meeting} clients={clients} projects={projects} />);

    await user.click(screen.getByRole("button", { name: "Edit meeting" }));
    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("That time is no longer available")).toBeInTheDocument();
  });
});

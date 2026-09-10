import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({ addLeadNoteAction: vi.fn() }));

import { addLeadNoteAction } from "@/app/(app)/leads/actions";
import type { LeadEvent } from "@/lib/leads";
import LeadTimeline from "./LeadTimeline";

const mockedAdd = vi.mocked(addLeadNoteAction);

const events: LeadEvent[] = [
  { id: "e1", lead_id: "l1", kind: "created", body: "Ada added this lead", actor_name: "Ada", created_at: "2026-09-01T10:00:00Z" },
  { id: "e2", lead_id: "l1", kind: "status_changed", body: "Status changed from New to Qualified", actor_name: "Ada", created_at: "2026-09-02T10:00:00Z" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LeadTimeline", () => {
  it("renders each event", () => {
    render(<LeadTimeline agencyId="a1" leadId="l1" events={events} />);
    expect(screen.getByText("Ada added this lead")).toBeInTheDocument();
    expect(screen.getByText("Status changed from New to Qualified")).toBeInTheDocument();
  });

  it("adds a note and prepends it", async () => {
    const newEvent: LeadEvent = {
      id: "e3",
      lead_id: "l1",
      kind: "note",
      body: "Left a voicemail",
      actor_name: "Ada",
      created_at: "2026-09-03T10:00:00Z",
    };
    mockedAdd.mockResolvedValueOnce({ event: newEvent });
    const user = userEvent.setup();
    render(<LeadTimeline agencyId="a1" leadId="l1" events={events} />);

    await user.type(screen.getByLabelText("Add a note"), "Left a voicemail");
    await user.click(screen.getByRole("button", { name: "Add note" }));

    expect(mockedAdd).toHaveBeenCalledWith("a1", "l1", "Left a voicemail");
    expect(await screen.findByText("Left a voicemail")).toBeInTheDocument();
  });
});

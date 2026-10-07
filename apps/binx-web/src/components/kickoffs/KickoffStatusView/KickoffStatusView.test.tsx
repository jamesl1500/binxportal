import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/projects/[projectId]/kickoff/actions", () => ({
  convertKickoffAction: vi.fn(),
  nudgeKickoffAction: vi.fn(),
}));

const mockedToastError = vi.fn();
const mockedToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockedToastError(...args), success: (...args: unknown[]) => mockedToastSuccess(...args) },
}));

import { convertKickoffAction, nudgeKickoffAction } from "@/app/(app)/projects/[projectId]/kickoff/actions";
import type { KickoffDetail } from "@/lib/kickoffs";

import KickoffStatusView from "./KickoffStatusView";

const mockedConvert = vi.mocked(convertKickoffAction);
const mockedNudge = vi.mocked(nudgeKickoffAction);

beforeEach(() => {
  vi.clearAllMocks();
});

const sentKickoff: KickoffDetail = {
  id: "k1",
  project_id: "p1",
  agency_id: "a1",
  client_id: "c1",
  title: "Project kickoff",
  intro_message: "Let's get aligned.",
  status: "sent",
  sent_at: "2026-09-20T00:00:00Z",
  last_nudged_at: null,
  completed_at: null,
  converted_at: null,
  created_at: "2026-09-20T00:00:00Z",
  questions: [{ id: "q1", position: 0, type: "text", label: "What's the goal?", options: [], required: true }],
  answers: [],
};

const completedKickoff: KickoffDetail = {
  ...sentKickoff,
  status: "completed",
  completed_at: "2026-09-22T00:00:00Z",
  questions: [
    { id: "q1", position: 0, type: "text", label: "What's the goal?", options: [], required: true },
    { id: "q2", position: 1, type: "multiple_choice", label: "Budget?", options: ["$1k", "$5k"], required: true },
    { id: "q3", position: 2, type: "file_upload", label: "Brand guide", options: [], required: false },
  ],
  answers: [
    { question_id: "q1", text_value: "Grow revenue", selected_options: [], file_id: null, file_name: null, answered_at: "2026-09-21T00:00:00Z" },
    { question_id: "q2", text_value: null, selected_options: ["$5k"], file_id: null, file_name: null, answered_at: "2026-09-21T00:00:00Z" },
    { question_id: "q3", text_value: null, selected_options: [], file_id: "f1", file_name: "guide.pdf", answered_at: "2026-09-21T00:00:00Z" },
  ],
};

describe("KickoffStatusView", () => {
  it("shows a Remind client button while sent and waiting on the client", async () => {
    mockedNudge.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<KickoffStatusView agencyId="a1" projectId="p1" kickoff={sentKickoff} taskLists={[]} />);

    expect(screen.getByText(/sent — waiting on client/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /remind client/i }));

    expect(mockedNudge).toHaveBeenCalledWith("a1", "p1");
    expect(mockedToastSuccess).toHaveBeenCalledWith("Reminder sent");
  });

  it("renders each answer type once completed", () => {
    render(<KickoffStatusView agencyId="a1" projectId="p1" kickoff={completedKickoff} taskLists={[]} />);

    expect(screen.getByText("Grow revenue")).toBeInTheDocument();
    expect(screen.getByText("$5k")).toBeInTheDocument();
    expect(screen.getByText(/uploaded: guide.pdf/i)).toBeInTheDocument();
  });

  it("converts answers to tasks with the picked list", async () => {
    mockedConvert.mockResolvedValueOnce({ tasksCreated: 3 });
    const user = userEvent.setup();
    render(
      <KickoffStatusView
        agencyId="a1"
        projectId="p1"
        kickoff={completedKickoff}
        taskLists={[{ id: "list-1", name: "To do" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /convert to tasks/i }));
    await user.click(screen.getByRole("button", { name: "Convert" }));

    expect(mockedConvert).toHaveBeenCalledWith("a1", "p1", "list-1");
    expect(mockedToastSuccess).toHaveBeenCalledWith("3 tasks added to the board");
  });

  it("shows a converted link instead of the convert button once converted", () => {
    render(
      <KickoffStatusView
        agencyId="a1"
        projectId="p1"
        kickoff={{ ...completedKickoff, converted_at: "2026-09-23T00:00:00Z" }}
        taskLists={[]}
      />,
    );

    expect(screen.queryByRole("button", { name: /convert to tasks/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view the board/i })).toBeInTheDocument();
  });

  it("shows a toast when the nudge fails", async () => {
    mockedNudge.mockResolvedValueOnce({ error: "Unable to send reminder" });
    const user = userEvent.setup();
    render(<KickoffStatusView agencyId="a1" projectId="p1" kickoff={sentKickoff} taskLists={[]} />);

    await user.click(screen.getByRole("button", { name: /remind client/i }));

    expect(mockedToastError).toHaveBeenCalledWith("Unable to send reminder");
  });
});

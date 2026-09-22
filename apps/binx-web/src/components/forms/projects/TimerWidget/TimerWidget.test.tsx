import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockedRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockedRefresh }) }));

vi.mock("@/app/(app)/projects/[projectId]/time/actions", () => ({
  startTimerAction: vi.fn(),
  stopTimerAction: vi.fn(),
}));

const mockedToastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => mockedToastError(...args) } }));

import { startTimerAction, stopTimerAction } from "@/app/(app)/projects/[projectId]/time/actions";
import type { TimeEntry } from "@/lib/time-tracking";

import TimerWidget from "./TimerWidget";

const mockedStart = vi.mocked(startTimerAction);
const mockedStop = vi.mocked(stopTimerAction);

const agencyId = "agency-1";
const projectId = "project-1";
const tasks = [
  { id: "task-1", title: "Design the hero" },
  { id: "task-2", title: "Fix the footer" },
];

const runningEntry: TimeEntry = {
  id: "entry-1",
  project_id: projectId,
  project_name: "Acme Rebrand",
  task_id: null,
  task_title: null,
  user_id: "user-1",
  user_name: "Jane Doe",
  description: "Client call",
  started_at: "2026-01-01T00:00:00.000Z",
  ended_at: null,
  duration_minutes: 0,
  is_billable: true,
  hourly_rate_cents: 15000,
  amount_cents: null,
  invoiced: false,
  created_at: "2026-01-01T00:00:00.000Z",
} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TimerWidget", () => {
  it("shows a start form when no timer is running", () => {
    render(<TimerWidget agencyId={agencyId} projectId={projectId} tasks={tasks} runningTimer={null} />);

    expect(screen.getByRole("button", { name: "Start timer" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Design the hero" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop timer" })).not.toBeInTheDocument();
  });

  it("starts the timer with the selected task, description, and billable flag", async () => {
    mockedStart.mockResolvedValueOnce({ entry: runningEntry });
    const user = userEvent.setup();
    render(<TimerWidget agencyId={agencyId} projectId={projectId} tasks={tasks} runningTimer={null} />);

    await user.selectOptions(screen.getByLabelText("Task (optional)"), "task-2");
    await user.type(screen.getByLabelText("Description (optional)"), "Client call");
    await user.click(screen.getByRole("button", { name: "Start timer" }));

    expect(mockedStart).toHaveBeenCalledWith(agencyId, projectId, {
      projectId,
      taskId: "task-2",
      description: "Client call",
      isBillable: true,
    });
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });

  it("shows a toast when starting the timer fails", async () => {
    mockedStart.mockResolvedValueOnce({ error: "You already have a timer running" });
    const user = userEvent.setup();
    render(<TimerWidget agencyId={agencyId} projectId={projectId} tasks={tasks} runningTimer={null} />);

    await user.click(screen.getByRole("button", { name: "Start timer" }));

    expect(mockedToastError).toHaveBeenCalledWith("You already have a timer running");
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it("shows the ticking elapsed time and a Stop button when a timer is running", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const startedFiveSecondsAgo = { ...runningEntry, started_at: "2025-12-31T23:59:55.000Z" };
    render(<TimerWidget agencyId={agencyId} projectId={projectId} tasks={tasks} runningTimer={startedFiveSecondsAgo} />);

    expect(screen.getByText("00:00:05")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("00:00:08")).toBeInTheDocument();
  });

  it("shows which project a timer running elsewhere belongs to", () => {
    const elsewhere = { ...runningEntry, project_id: "other-project" };
    render(<TimerWidget agencyId={agencyId} projectId={projectId} tasks={tasks} runningTimer={elsewhere} />);

    expect(screen.getByText(/Running on Acme Rebrand/)).toBeInTheDocument();
  });

  it("stops the running timer", async () => {
    mockedStop.mockResolvedValueOnce({ entry: { ...runningEntry, ended_at: "2026-01-01T00:00:05.000Z" } });
    const user = userEvent.setup();
    render(<TimerWidget agencyId={agencyId} projectId={projectId} tasks={tasks} runningTimer={runningEntry} />);

    await user.click(screen.getByRole("button", { name: "Stop timer" }));

    expect(mockedStop).toHaveBeenCalledWith(agencyId, projectId, "entry-1");
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockedRefresh }) }));

vi.mock("@/app/(app)/projects/[projectId]/time/actions", () => ({
  logManualEntryAction: vi.fn(),
}));

const mockedToastError = vi.fn();
const mockedToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockedToastError(...args), success: (...args: unknown[]) => mockedToastSuccess(...args) },
}));

import { logManualEntryAction } from "@/app/(app)/projects/[projectId]/time/actions";

import ManualEntryForm from "./ManualEntryForm";

const mockedLog = vi.mocked(logManualEntryAction);

const agencyId = "agency-1";
const projectId = "project-1";
const tasks = [{ id: "task-1", title: "Design the hero" }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ManualEntryForm", () => {
  it("logs a manual entry with the mapped payload", async () => {
    mockedLog.mockResolvedValueOnce({ entry: { id: "entry-1" } } as never);
    const user = userEvent.setup();
    render(<ManualEntryForm agencyId={agencyId} projectId={projectId} tasks={tasks} />);

    await user.selectOptions(screen.getByLabelText("Task (optional)"), "task-1");
    await user.type(screen.getByLabelText("Description (optional)"), "Client call");
    await user.clear(screen.getByLabelText("Start"));
    await user.type(screen.getByLabelText("Start"), "2026-01-01T09:00");
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "2026-01-01T10:30");
    await user.type(screen.getByLabelText("Hourly rate override (optional)"), "150");
    await user.click(screen.getByRole("button", { name: "Log time" }));

    expect(mockedLog).toHaveBeenCalledWith(agencyId, projectId, {
      projectId,
      taskId: "task-1",
      description: "Client call",
      startedAt: new Date("2026-01-01T09:00").toISOString(),
      endedAt: new Date("2026-01-01T10:30").toISOString(),
      isBillable: true,
      hourlyRateCents: 15000,
    });
    expect(mockedToastSuccess).toHaveBeenCalledWith("Time entry logged");
    expect(mockedRefresh).toHaveBeenCalledOnce();
  });

  it("rejects an end time that isn't after the start time", async () => {
    const user = userEvent.setup();
    render(<ManualEntryForm agencyId={agencyId} projectId={projectId} tasks={tasks} />);

    await user.clear(screen.getByLabelText("Start"));
    await user.type(screen.getByLabelText("Start"), "2026-01-01T10:00");
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "2026-01-01T09:00");
    await user.click(screen.getByRole("button", { name: "Log time" }));

    expect(await screen.findByText("End time must be after the start time")).toBeInTheDocument();
    expect(mockedLog).not.toHaveBeenCalled();
  });

  it("rejects an invalid hourly rate", async () => {
    const user = userEvent.setup();
    render(<ManualEntryForm agencyId={agencyId} projectId={projectId} tasks={tasks} />);

    const rateInput = screen.getByLabelText("Hourly rate override (optional)");
    await user.type(rateInput, "-5");
    await user.click(screen.getByRole("button", { name: "Log time" }));

    expect(await screen.findByText("Enter a valid hourly rate")).toBeInTheDocument();
    expect(mockedLog).not.toHaveBeenCalled();
  });

  it("shows the server error on failure", async () => {
    mockedLog.mockResolvedValueOnce({ error: "ended_at must be after started_at" });
    const user = userEvent.setup();
    render(<ManualEntryForm agencyId={agencyId} projectId={projectId} tasks={tasks} />);

    await user.click(screen.getByRole("button", { name: "Log time" }));

    expect(await screen.findByText("ended_at must be after started_at")).toBeInTheDocument();
    expect(mockedToastError).toHaveBeenCalledWith("ended_at must be after started_at");
    expect(mockedRefresh).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/invoices/recurring/actions", () => ({
  pauseRecurringScheduleAction: vi.fn(),
  resumeRecurringScheduleAction: vi.fn(),
  runRecurringScheduleNowAction: vi.fn(),
  deleteRecurringScheduleAction: vi.fn(),
}));

import { toast } from "sonner";
import {
  deleteRecurringScheduleAction,
  pauseRecurringScheduleAction,
  resumeRecurringScheduleAction,
  runRecurringScheduleNowAction,
} from "@/app/(app)/invoices/recurring/actions";
import type { RecurringSchedule } from "@/lib/recurring-invoices";

import RecurringScheduleActions from "./RecurringScheduleActions";

const pause = vi.mocked(pauseRecurringScheduleAction);
const resume = vi.mocked(resumeRecurringScheduleAction);
const runNow = vi.mocked(runRecurringScheduleNowAction);
const del = vi.mocked(deleteRecurringScheduleAction);

const schedule = (overrides: Partial<RecurringSchedule> = {}) =>
  ({
    id: "s1",
    title: "Monthly retainer",
    is_active: true,
    ...overrides,
  }) as RecurringSchedule;

beforeEach(() => {
  vi.clearAllMocks();
  pause.mockResolvedValue({} as never);
  resume.mockResolvedValue({} as never);
  runNow.mockResolvedValue({} as never);
  del.mockResolvedValue({} as never);
});

describe("RecurringScheduleActions", () => {
  it("renders nothing when the caller can't manage schedules", () => {
    const { container } = render(
      <RecurringScheduleActions agencyId="a1" schedule={schedule()} canManage={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Pause for an active schedule and pauses it", async () => {
    render(<RecurringScheduleActions agencyId="a1" schedule={schedule({ is_active: true })} canManage />);
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(pause).toHaveBeenCalledWith("a1", "s1");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows Resume for a paused schedule and resumes it", async () => {
    render(<RecurringScheduleActions agencyId="a1" schedule={schedule({ is_active: false })} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(resume).toHaveBeenCalledWith("a1", "s1");
  });

  it("runs the schedule now through the confirm dialog", async () => {
    render(<RecurringScheduleActions agencyId="a1" schedule={schedule()} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(await screen.findByText("Run “Monthly retainer” now?")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Run now" }).at(-1)!);
    expect(runNow).toHaveBeenCalledWith("a1", "s1");
  });

  it("deletes the schedule through the confirm dialog", async () => {
    render(<RecurringScheduleActions agencyId="a1" schedule={schedule()} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete “Monthly retainer”?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete schedule" }));
    expect(del).toHaveBeenCalledWith("a1", "s1");
  });

  it("toasts an error the action returns", async () => {
    pause.mockResolvedValueOnce({ error: "Nope" } as never);
    render(<RecurringScheduleActions agencyId="a1" schedule={schedule()} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(toast.error).toHaveBeenCalledWith("Nope");
  });
});

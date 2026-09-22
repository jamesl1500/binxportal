import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/dashboard/actions", () => ({
  updateDashboardLayoutAction: vi.fn(),
}));

import { updateDashboardLayoutAction } from "@/app/(app)/dashboard/actions";
import { DASHBOARD_WIDGET_IDS } from "@/components/dashboard/widgets";
import DashboardWidgetGrid from "./DashboardWidgetGrid";

const mockedUpdate = vi.mocked(updateDashboardLayoutAction);

/** A minimal DataTransfer stand-in — jsdom doesn't implement one. Same shape as KanbanBoard.test.tsx. */
function dataTransfer() {
  const store: Record<string, string> = {};
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: (key: string, value: string) => {
      store[key] = value;
    },
    getData: (key: string) => store[key] ?? "",
  };
}

const baseProps = {
  overdueInvoices: [],
  overdueTaskCount: 0,
  onHoldProjects: [],
  activity: [],
  meetings: [],
  myTasks: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUpdate.mockResolvedValue({} as never);
});

describe("DashboardWidgetGrid", () => {
  it("renders every default widget, in order, with no customize controls", () => {
    render(<DashboardWidgetGrid initialOrder={[]} initialHidden={[]} {...baseProps} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["My tasks", "Needs attention", "Quick actions", "Recent activity", "Upcoming meetings"]);
    expect(screen.queryByRole("button", { name: /hide/i })).not.toBeInTheDocument();
  });

  it("does not render a widget the user previously hid", () => {
    render(<DashboardWidgetGrid initialOrder={[]} initialHidden={["recent_activity"]} {...baseProps} />);
    expect(screen.queryByRole("heading", { name: "Recent activity" })).not.toBeInTheDocument();
  });

  it("respects a custom stored order", () => {
    const order = ["quick_actions", "my_tasks", "needs_attention", "recent_activity", "upcoming_meetings"];
    render(<DashboardWidgetGrid initialOrder={order} initialHidden={[]} {...baseProps} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toBe("Quick actions");
  });

  it("entering customize mode shows drag handles and per-widget hide toggles, and hiding persists", async () => {
    const user = userEvent.setup();
    render(<DashboardWidgetGrid initialOrder={[]} initialHidden={[]} {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Customize" }));
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide Recent activity" }));

    expect(await screen.findByText("Hidden from your dashboard.")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        [...DASHBOARD_WIDGET_IDS],
        ["recent_activity"],
      ),
    );

    // Still shown (as hidden) while customizing — only disappears once you leave customize mode.
    expect(screen.getByRole("heading", { name: "Recent activity" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show Recent activity" }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenLastCalledWith([...DASHBOARD_WIDGET_IDS], []));
  });

  it("reordering via drag-and-drop persists the new order", async () => {
    const user = userEvent.setup();
    render(<DashboardWidgetGrid initialOrder={[]} initialHidden={[]} {...baseProps} />);
    await user.click(screen.getByRole("button", { name: "Customize" }));

    const dragged = screen.getByRole("heading", { name: "Upcoming meetings" }).closest("[draggable]") as HTMLElement;
    const target = screen.getByRole("heading", { name: "My tasks" }).closest("[draggable]") as HTMLElement;
    const transfer = dataTransfer();

    fireEvent.dragStart(dragged, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        ["upcoming_meetings", "my_tasks", "needs_attention", "quick_actions", "recent_activity"],
        [],
      ),
    );
  });

  it("resets order and hidden widgets to default", async () => {
    const user = userEvent.setup();
    render(
      <DashboardWidgetGrid
        initialOrder={["quick_actions", "my_tasks", "needs_attention", "recent_activity", "upcoming_meetings"]}
        initialHidden={["recent_activity"]}
        {...baseProps}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "Reset to default" }));

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["My tasks", "Needs attention", "Quick actions", "Recent activity", "Upcoming meetings"]);
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith([...DASHBOARD_WIDGET_IDS], []));
  });

  it("shows an inline error when saving the layout fails", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValueOnce({ error: "Unable to save your dashboard layout" } as never);
    render(<DashboardWidgetGrid initialOrder={[]} initialHidden={[]} {...baseProps} />);

    await user.click(screen.getByRole("button", { name: "Customize" }));
    await user.click(screen.getByRole("button", { name: "Hide Recent activity" }));

    expect(await screen.findByText("Unable to save your dashboard layout")).toBeInTheDocument();
  });
});

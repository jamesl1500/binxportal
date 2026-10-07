import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  updateProjectDashboardLayoutAction: vi.fn(),
}));

import { updateProjectDashboardLayoutAction } from "@/app/(app)/projects/[projectId]/actions";
import ProjectDashboardGrid from "./ProjectDashboardGrid";
import { normalizeProjectWidgetOrder, PROJECT_WIDGET_IDS } from "./widgets";

const mockedUpdate = vi.mocked(updateProjectDashboardLayoutAction);

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

const widgets = {
  overview: <p>overview body</p>,
  my_tasks: <p>my tasks body</p>,
  board: <p>board body</p>,
  team: <p>team body</p>,
  meetings: <p>meetings body</p>,
};

const headings = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUpdate.mockResolvedValue({});
});

describe("ProjectDashboardGrid", () => {
  it("shows only visible widgets, in stored order, with their bodies and header actions", () => {
    render(
      <ProjectDashboardGrid
        initialOrder={["team", "overview"]}
        initialHidden={["ai_summary", "files", "meetings"]}
        initialWide={["overview"]}
        widgets={widgets}
        headerActions={{ team: <button type="button">Manage team</button> }}
      />,
    );

    expect(headings()).toEqual(["Team", "Overview", "My tasks", "Board"]);
    expect(screen.getByText("team body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage team" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Overview" })).toHaveAttribute("data-wide", "true");
    expect(screen.queryByRole("button", { name: /hide/i })).not.toBeInTheDocument();
  });

  it("lists hidden widgets while customizing and persists un-hiding one, asking the action to re-render for its body", async () => {
    render(
      <ProjectDashboardGrid
        initialOrder={[]}
        initialHidden={["files"]}
        initialWide={[]}
        widgets={widgets}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Customize" }));
    expect(headings()).toHaveLength(PROJECT_WIDGET_IDS.length);

    await userEvent.click(screen.getByRole("button", { name: "Show Files" }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith([...PROJECT_WIDGET_IDS], [], [], { refresh: true }),
    );
  });

  it("hides a widget without asking for a re-render", async () => {
    render(<ProjectDashboardGrid initialOrder={[]} initialHidden={[]} initialWide={[]} widgets={widgets} />);
    await userEvent.click(screen.getByRole("button", { name: "Customize" }));
    await userEvent.click(screen.getByRole("button", { name: "Hide Board" }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith([...PROJECT_WIDGET_IDS], ["board"], [], { refresh: false }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("heading", { name: "Board" })).not.toBeInTheDocument();
  });

  it("reorders with the arrow buttons and toggles width", async () => {
    render(<ProjectDashboardGrid initialOrder={[]} initialHidden={[]} initialWide={[]} widgets={widgets} />);
    await userEvent.click(screen.getByRole("button", { name: "Customize" }));

    expect(screen.getByRole("button", { name: "Move Overview earlier" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move Overview later" }));
    expect(headings().slice(0, 2)).toEqual(["My tasks", "Overview"]);

    await userEvent.click(screen.getByRole("button", { name: "Make Team full width" }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith(expect.any(Array), [], ["team"], { refresh: false }),
    );
    expect(screen.getByRole("region", { name: "Team" })).toHaveAttribute("data-wide", "true");
  });

  it("reorders by drag and drop", async () => {
    render(<ProjectDashboardGrid initialOrder={[]} initialHidden={[]} initialWide={[]} widgets={widgets} />);
    await userEvent.click(screen.getByRole("button", { name: "Customize" }));

    const transfer = dataTransfer();
    fireEvent.dragStart(screen.getByRole("region", { name: "Team" }), { dataTransfer: transfer });
    fireEvent.dragOver(screen.getByRole("region", { name: "Overview" }), { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole("region", { name: "Overview" }), { dataTransfer: transfer });

    expect(headings()[0]).toBe("Team");
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
  });

  it("resets to the default layout", async () => {
    render(
      <ProjectDashboardGrid
        initialOrder={["files"]}
        initialHidden={[]}
        initialWide={["team"]}
        widgets={{ ...widgets, files: <p>files</p>, ai_summary: <p>ai</p> }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Customize" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        [...PROJECT_WIDGET_IDS],
        ["ai_summary", "files"],
        ["overview"],
        { refresh: false },
      ),
    );
  });

  it("shows a save error", async () => {
    mockedUpdate.mockResolvedValueOnce({ error: "Nope" });
    render(<ProjectDashboardGrid initialOrder={[]} initialHidden={[]} initialWide={[]} widgets={widgets} />);
    await userEvent.click(screen.getByRole("button", { name: "Customize" }));
    await userEvent.click(screen.getByRole("button", { name: "Hide Team" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
  });

  it("explains itself when every widget is hidden", () => {
    render(
      <ProjectDashboardGrid
        initialOrder={[]}
        initialHidden={[...PROJECT_WIDGET_IDS]}
        initialWide={[]}
        widgets={{}}
      />,
    );
    expect(screen.getByText(/Every widget is hidden/)).toBeInTheDocument();
  });
});

describe("normalizeProjectWidgetOrder", () => {
  it("drops unknown ids and appends missing ones in canonical order", () => {
    expect(normalizeProjectWidgetOrder(["files", "bogus", "overview"])).toEqual([
      "files",
      "overview",
      "my_tasks",
      "board",
      "team",
      "meetings",
      "ai_summary",
    ]);
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({
  suggestProjectTasksAction: vi.fn(),
  applyProjectTaskSuggestionsAction: vi.fn(),
}));

import {
  applyProjectTaskSuggestionsAction,
  suggestProjectTasksAction,
} from "@/app/(app)/projects/[projectId]/actions";
import AiTaskSetup from "./AiTaskSetup";

const mockedSuggest = vi.mocked(suggestProjectTasksAction);
const mockedApply = vi.mocked(applyProjectTaskSuggestionsAction);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiTaskSetup", () => {
  it("calls onDone immediately when the offer is skipped", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<AiTaskSetup agencyId="a1" projectId="p1" onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockedSuggest).not.toHaveBeenCalled();
  });

  it("suggests, reviews, and applies a starter board", async () => {
    mockedSuggest.mockResolvedValue({
      suggestions: {
        lists: [
          {
            name: "Discovery",
            tasks: [
              { title: "Kickoff call", description: "Align on scope." },
              { title: "Gather assets", description: null },
            ],
          },
        ],
      },
    });
    mockedApply.mockResolvedValue({});
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<AiTaskSetup agencyId="a1" projectId="p1" onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Suggest tasks" }));

    expect(await screen.findByDisplayValue("Discovery")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Kickoff call")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Gather assets")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to board" }));

    expect(mockedApply).toHaveBeenCalledWith("a1", "p1", {
      lists: [
        {
          name: "Discovery",
          tasks: [
            { title: "Kickoff call", description: "Align on scope." },
            { title: "Gather assets", description: null },
          ],
        },
      ],
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("lets a task be removed from the review before applying", async () => {
    mockedSuggest.mockResolvedValue({
      suggestions: {
        lists: [
          {
            name: "Discovery",
            tasks: [
              { title: "Kickoff call", description: null },
              { title: "Gather assets", description: null },
            ],
          },
        ],
      },
    });
    mockedApply.mockResolvedValue({});
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<AiTaskSetup agencyId="a1" projectId="p1" onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Suggest tasks" }));
    await screen.findByDisplayValue("Kickoff call");

    await user.click(screen.getByRole("button", { name: 'Remove task "Gather assets"' }));
    expect(screen.queryByDisplayValue("Gather assets")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to board" }));
    expect(mockedApply).toHaveBeenCalledWith("a1", "p1", {
      lists: [{ name: "Discovery", tasks: [{ title: "Kickoff call", description: null }] }],
    });
  });

  it("shows an error and lets the user continue when suggesting fails", async () => {
    mockedSuggest.mockResolvedValue({ error: "AI isn't configured for this agency yet." });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<AiTaskSetup agencyId="a1" projectId="p1" onDone={onDone} />);

    await user.click(screen.getByRole("button", { name: "Suggest tasks" }));

    expect(await screen.findByText("AI isn't configured for this agency yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

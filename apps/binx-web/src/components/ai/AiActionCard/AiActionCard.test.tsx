import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AiAction } from "@/lib/ai";

import AiActionCard from "./AiActionCard";

const action: AiAction = {
  id: "act-1",
  tool: "create_task",
  summary: 'Add the task "Draft copy" to Website Redesign › To Do',
  status: "pending",
  result: null,
  created_at: "2026-01-03T00:00:00Z",
};

describe("AiActionCard", () => {
  it("offers Approve/Decline while pending, and locks both while one is in flight", async () => {
    let finish: () => void = () => {};
    const onResolve = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<AiActionCard action={action} onResolve={onResolve} />);

    expect(screen.getByText("Needs your approval")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(onResolve).toHaveBeenCalledWith("act-1", "approve");
    expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeDisabled();
    finish();
  });

  it("shows why a change couldn't be applied, with no buttons", () => {
    render(
      <AiActionCard action={{ ...action, status: "failed", result: "Task not found" }} onResolve={vi.fn()} />,
    );

    expect(screen.getByText("Couldn't apply")).toBeInTheDocument();
    expect(screen.getByText("Task not found")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

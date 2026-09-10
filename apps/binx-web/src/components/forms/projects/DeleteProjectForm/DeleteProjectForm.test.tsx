import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/projects/[projectId]/actions", () => ({ deleteProjectAction: vi.fn() }));

import { deleteProjectAction } from "@/app/(app)/projects/[projectId]/actions";
import DeleteProjectForm from "./DeleteProjectForm";

const mocked = vi.mocked(deleteProjectAction);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue(undefined as never);
});

const props = { agencyId: "a1", projectId: "p1", projectName: "Website Redesign" };

describe("DeleteProjectForm", () => {
  it("requires the exact project name before deleting", async () => {
    render(<DeleteProjectForm {...props} />);
    await userEvent.type(screen.getByRole("textbox"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Delete this project" }));
    expect(await screen.findByText('Type "Website Redesign" to confirm')).toBeInTheDocument();
    expect(mocked).not.toHaveBeenCalled();
  });

  it("deletes once the name matches", async () => {
    render(<DeleteProjectForm {...props} />);
    await userEvent.type(screen.getByRole("textbox"), "Website Redesign");
    await userEvent.click(screen.getByRole("button", { name: "Delete this project" }));
    expect(mocked).toHaveBeenCalledWith("a1", "p1");
  });

  it("shows an error the action returns", async () => {
    mocked.mockResolvedValueOnce({ error: "Cannot delete" } as never);
    render(<DeleteProjectForm {...props} />);
    await userEvent.type(screen.getByRole("textbox"), "Website Redesign");
    await userEvent.click(screen.getByRole("button", { name: "Delete this project" }));
    expect(await screen.findByText("Cannot delete")).toBeInTheDocument();
  });
});

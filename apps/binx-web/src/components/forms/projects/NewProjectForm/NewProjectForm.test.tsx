import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/components/forms/projects/ProjectForm/ProjectForm", () => ({
  default: ({ onSuccess }: { onSuccess: (p: unknown) => void }) => (
    <button onClick={() => onSuccess({ id: "p1", name: "Redesign" })}>fake-create</button>
  ),
}));
vi.mock("@/components/projects/AiTaskSetup/AiTaskSetup", () => ({
  default: ({ onDone }: { onDone: () => void }) => <button onClick={onDone}>fake-ai-done</button>,
}));

import NewProjectForm from "./NewProjectForm";

beforeEach(() => vi.clearAllMocks());

describe("NewProjectForm", () => {
  it("shows the AI task setup step after a successful create, without navigating yet", async () => {
    render(<NewProjectForm agencyId="a1" clients={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "fake-create" }));

    expect(await screen.findByText("Redesign created")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to the new project once the AI task setup step finishes", async () => {
    render(<NewProjectForm agencyId="a1" clients={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "fake-create" }));
    await userEvent.click(await screen.findByRole("button", { name: "fake-ai-done" }));

    expect(mockPush).toHaveBeenCalledWith("/projects/p1");
  });
});

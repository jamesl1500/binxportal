import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/forms/projects/ProjectForm/ProjectForm", () => ({
  default: ({ onSuccess, onCancel }: { onSuccess: (p: unknown) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onSuccess({ id: "p1", name: "Redesign" })}>fake-create</button>
      <button onClick={onCancel}>fake-cancel</button>
    </div>
  ),
}));
vi.mock("@/components/projects/AiTaskSetup/AiTaskSetup", () => ({
  default: ({ onDone }: { onDone: () => void }) => (
    <div>
      <button onClick={onDone}>fake-ai-done</button>
    </div>
  ),
}));
// Renders a PageCoachmark on the trigger button, which reads tutorial state
// via context — not under test here.
vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({ isPopupDismissed: () => true, dismissPopup: vi.fn() }),
}));

import CreateProjectDialog from "./CreateProjectDialog";

beforeEach(() => vi.clearAllMocks());

describe("CreateProjectDialog", () => {
  it("opens the dialog from the trigger", async () => {
    render(<CreateProjectDialog agencyId="a1" clients={[]} />);
    expect(screen.queryByText("Add a new project")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(await screen.findByText("Add a new project")).toBeInTheDocument();
  });

  it("shows the AI task setup step after a successful create, without refreshing yet", async () => {
    render(<CreateProjectDialog agencyId="a1" clients={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new project/i }));
    await userEvent.click(screen.getByRole("button", { name: "fake-create" }));

    expect(await screen.findByText("Redesign created")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("closes and refreshes once the AI task setup step finishes", async () => {
    render(<CreateProjectDialog agencyId="a1" clients={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new project/i }));
    await userEvent.click(screen.getByRole("button", { name: "fake-create" }));
    await userEvent.click(await screen.findByRole("button", { name: "fake-ai-done" }));

    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText("Redesign created")).toBeNull();
  });

  it("closes without refreshing on cancel from the form step", async () => {
    render(<CreateProjectDialog agencyId="a1" clients={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new project/i }));
    await userEvent.click(screen.getByRole("button", { name: "fake-cancel" }));
    expect(refresh).not.toHaveBeenCalled();
  });
});

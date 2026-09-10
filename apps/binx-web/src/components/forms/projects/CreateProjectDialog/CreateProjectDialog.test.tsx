import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/forms/projects/ProjectForm/ProjectForm", () => ({
  default: ({ onSuccess, onCancel }: { onSuccess: (p: unknown) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onSuccess({ id: "p1" })}>fake-create</button>
      <button onClick={onCancel}>fake-cancel</button>
    </div>
  ),
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

  it("closes and refreshes after a successful create", async () => {
    render(<CreateProjectDialog agencyId="a1" clients={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new project/i }));
    await userEvent.click(screen.getByRole("button", { name: "fake-create" }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText("Add a new project")).toBeNull();
  });

  it("closes without refreshing on cancel", async () => {
    render(<CreateProjectDialog agencyId="a1" clients={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /new project/i }));
    await userEvent.click(screen.getByRole("button", { name: "fake-cancel" }));
    expect(refresh).not.toHaveBeenCalled();
  });
});

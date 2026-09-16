import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/leads/LeadForm/LeadForm", () => ({
  default: ({ onSuccess, onCancel }: { onSuccess: (l: unknown) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onSuccess({ id: "l1" })}>fake-save</button>
      <button onClick={onCancel}>fake-cancel</button>
    </div>
  ),
}));
// Renders a PageCoachmark on the trigger button, which reads tutorial state
// via context — not under test here.
vi.mock("@/components/tutorial/TutorialProvider/TutorialProvider", () => ({
  useTutorial: () => ({ isPopupDismissed: () => true, dismissPopup: vi.fn() }),
}));

import CreateLeadDialog from "./CreateLeadDialog";

beforeEach(() => vi.clearAllMocks());

describe("CreateLeadDialog", () => {
  it("opens from the trigger", async () => {
    render(<CreateLeadDialog agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: /new lead/i }));
    expect(await screen.findByText("Add a new lead")).toBeInTheDocument();
  });

  it("closes and refreshes once a lead is saved", async () => {
    render(<CreateLeadDialog agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: /new lead/i }));
    await userEvent.click(screen.getByRole("button", { name: "fake-save" }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText("Add a new lead")).toBeNull();
  });

  it("closes without refreshing on cancel", async () => {
    render(<CreateLeadDialog agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: /new lead/i }));
    await userEvent.click(screen.getByRole("button", { name: "fake-cancel" }));
    expect(refresh).not.toHaveBeenCalled();
  });
});

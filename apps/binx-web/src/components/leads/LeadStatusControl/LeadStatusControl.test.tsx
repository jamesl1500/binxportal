import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({ changeLeadStatusAction: vi.fn() }));

import { changeLeadStatusAction } from "@/app/(app)/leads/actions";
import LeadStatusControl from "./LeadStatusControl";

const mocked = vi.mocked(changeLeadStatusAction);

beforeEach(() => {
  vi.clearAllMocks();
  mocked.mockResolvedValue({} as never);
});

describe("LeadStatusControl", () => {
  it("renders a static pill when locked", () => {
    render(<LeadStatusControl agencyId="a1" leadId="l1" status={"won" as never} locked />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("changes status via the action and refreshes", async () => {
    render(<LeadStatusControl agencyId="a1" leadId="l1" status={"new" as never} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Lead status" }), "qualified");
    expect(mocked).toHaveBeenCalledWith("a1", "l1", "qualified", null);
    expect(refresh).toHaveBeenCalled();
  });

  it("prompts for a reason when moving to Lost", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Budget");
    render(<LeadStatusControl agencyId="a1" leadId="l1" status={"new" as never} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Lead status" }), "lost");
    expect(promptSpy).toHaveBeenCalled();
    expect(mocked).toHaveBeenCalledWith("a1", "l1", "lost", "Budget");
    promptSpy.mockRestore();
  });
});

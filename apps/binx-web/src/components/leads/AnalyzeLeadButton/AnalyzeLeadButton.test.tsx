import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({ analyzeLeadAction: vi.fn() }));

import { analyzeLeadAction } from "@/app/(app)/leads/actions";
import { toast } from "sonner";
import AnalyzeLeadButton from "./AnalyzeLeadButton";

const mocked = vi.mocked(analyzeLeadAction);

beforeEach(() => vi.clearAllMocks());

describe("AnalyzeLeadButton", () => {
  it("labels itself Analyze / Re-analyze based on prior state", () => {
    const { rerender } = render(<AnalyzeLeadButton agencyId="a1" leadId="l1" analyzed={false} />);
    expect(screen.getByRole("button", { name: "Analyze" })).toBeInTheDocument();
    rerender(<AnalyzeLeadButton agencyId="a1" leadId="l1" analyzed />);
    expect(screen.getByRole("button", { name: "Re-analyze" })).toBeInTheDocument();
  });

  it("analyzes and refreshes on success", async () => {
    mocked.mockResolvedValueOnce({} as never);
    render(<AnalyzeLeadButton agencyId="a1" leadId="l1" analyzed={false} />);
    await userEvent.click(screen.getByRole("button"));
    expect(mocked).toHaveBeenCalledWith("a1", "l1");
    expect(toast.success).toHaveBeenCalledWith("Lead analyzed");
    expect(refresh).toHaveBeenCalled();
  });

  it("toasts an error without refreshing", async () => {
    mocked.mockResolvedValueOnce({ error: "Budget reached" } as never);
    render(<AnalyzeLeadButton agencyId="a1" leadId="l1" analyzed={false} />);
    await userEvent.click(screen.getByRole("button"));
    expect(toast.error).toHaveBeenCalledWith("Budget reached");
    expect(refresh).not.toHaveBeenCalled();
  });
});

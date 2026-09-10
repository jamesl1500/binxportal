import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/(app)/leads/actions", () => ({ analyzeOpenLeadsAction: vi.fn() }));

import { analyzeOpenLeadsAction } from "@/app/(app)/leads/actions";
import { toast } from "sonner";
import AnalyzeAllButton from "./AnalyzeAllButton";

const mocked = vi.mocked(analyzeOpenLeadsAction);

beforeEach(() => vi.clearAllMocks());

describe("AnalyzeAllButton", () => {
  it("summarises how many leads were analyzed", async () => {
    mocked.mockResolvedValueOnce({ result: { analyzed: 3, skipped: 1 } } as never);
    render(<AnalyzeAllButton agencyId="a1" />);
    await userEvent.click(screen.getByRole("button", { name: /analyze open leads/i }));
    expect(mocked).toHaveBeenCalledWith("a1");
    expect(toast.success).toHaveBeenCalledWith("Analyzed 3 leads, 1 skipped");
    expect(refresh).toHaveBeenCalled();
  });

  it("says everything is up to date when nothing was analyzed", async () => {
    mocked.mockResolvedValueOnce({ result: { analyzed: 0, skipped: 0 } } as never);
    render(<AnalyzeAllButton agencyId="a1" />);
    await userEvent.click(screen.getByRole("button"));
    expect(toast.success).toHaveBeenCalledWith("Every open lead is already up to date");
  });

  it("toasts an error when the action fails", async () => {
    mocked.mockResolvedValueOnce({ error: "AI unavailable" } as never);
    render(<AnalyzeAllButton agencyId="a1" />);
    await userEvent.click(screen.getByRole("button"));
    expect(toast.error).toHaveBeenCalledWith("AI unavailable");
  });
});

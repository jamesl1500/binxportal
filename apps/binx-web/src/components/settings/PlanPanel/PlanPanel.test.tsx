import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/settings/plan/actions", () => ({ changePlanAction: vi.fn() }));
vi.mock("@/lib/billing-client", () => ({
  formatLimit: (v: number | null) => (v == null ? "Unlimited" : String(v)),
  formatPlanPrice: (c: number) => (c === 0 ? "Free" : `$${c / 100}/mo`),
}));
vi.mock("@/lib/money", () => ({ formatMoneyCents: (c: number) => `$${(c / 100).toFixed(2)}` }));

import { changePlanAction } from "@/app/(app)/settings/plan/actions";
import { toast } from "sonner";
import PlanPanel from "./PlanPanel";

const change = vi.mocked(changePlanAction);

const catalog = [
  { key: "free", name: "Free", price_cents_month: 0, max_clients: 3, max_active_projects: 3, max_leads: 25, max_team_members: 3, ai_monthly_budget_cents: 0 },
  { key: "pro", name: "Pro", price_cents_month: 14900, max_clients: 60, max_active_projects: 150, max_leads: 2000, max_team_members: 40, ai_monthly_budget_cents: 20000 },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  change.mockResolvedValue({} as never);
});

describe("PlanPanel", () => {
  it("marks the current plan and offers a switch on the others (manager)", () => {
    render(<PlanPanel agencyId="a1" currentPlan="free" catalog={catalog} canManage />);
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to this plan" })).toBeInTheDocument();
  });

  it("hides the switch button for a non-manager", () => {
    render(<PlanPanel agencyId="a1" currentPlan="free" catalog={catalog} canManage={false} />);
    expect(screen.queryByRole("button", { name: "Switch to this plan" })).toBeNull();
  });

  it("switches plan through the action and refreshes", async () => {
    render(<PlanPanel agencyId="a1" currentPlan="free" catalog={catalog} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to this plan" }));
    expect(change).toHaveBeenCalledWith("a1", "pro");
    expect(toast.success).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("toasts an error the action returns", async () => {
    change.mockResolvedValueOnce({ error: "Downgrade blocked" } as never);
    render(<PlanPanel agencyId="a1" currentPlan="free" catalog={catalog} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to this plan" }));
    expect(toast.error).toHaveBeenCalledWith("Downgrade blocked");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing-client", () => ({ formatLimit: (v: number | null) => (v == null ? "Unlimited" : String(v)) }));
vi.mock("@/lib/money", () => ({ formatMoneyCents: (c: number) => `$${(c / 100).toFixed(2)}` }));

import type { Subscription } from "@/lib/billing";
import PlanUsagePanel from "./PlanUsagePanel";

const subscription = {
  plan: "starter",
  status: "active",
  plan_order: [],
  limits: { max_clients: 15, max_active_projects: 25, max_leads: 250, ai_monthly_budget_cents: 5000 },
  usage: { clients: 15, active_projects: 10, leads: 40, team_members: 3 },
} as unknown as Subscription;

describe("PlanUsagePanel", () => {
  it("renders a row per limit with used / limit text", () => {
    render(<PlanUsagePanel subscription={subscription} aiSpentCents={1250} />);
    expect(screen.getByText("Clients")).toBeInTheDocument();
    expect(screen.getByText("15 / 15")).toBeInTheDocument();
    expect(screen.getByText("10 / 25")).toBeInTheDocument();
    expect(screen.getByText("$12.50 / $50.00")).toBeInTheDocument();
  });

  it("flags a row that has hit its cap", () => {
    render(<PlanUsagePanel subscription={subscription} aiSpentCents={0} />);
    expect(screen.getByText("15 / 15")).toHaveAttribute("data-at-limit", "true");
    expect(screen.getByText("10 / 25")).toHaveAttribute("data-at-limit", "false");
  });

  it("renders an unlimited cap as a plain count", () => {
    const unlimited = {
      ...subscription,
      limits: { ...subscription.limits, max_clients: null },
    } as unknown as Subscription;
    render(<PlanUsagePanel subscription={unlimited} aiSpentCents={0} />);
    expect(screen.getByText("15 / Unlimited")).toBeInTheDocument();
  });
});

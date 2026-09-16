import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/settings/plan/actions", () => ({
  changePlanAction: vi.fn(),
  startPlanCheckoutAction: vi.fn(),
}));
vi.mock("@/lib/billing-client", () => ({
  formatLimit: (v: number | null) => (v == null ? "Unlimited" : String(v)),
  formatPlanPrice: (c: number) => (c === 0 ? "Free" : `$${c / 100}/mo`),
}));
vi.mock("@/lib/money", () => ({ formatMoneyCents: (c: number) => `$${(c / 100).toFixed(2)}` }));

import { changePlanAction, startPlanCheckoutAction } from "@/app/(app)/settings/plan/actions";
import { toast } from "sonner";
import { PLAN_INTENT_STORAGE_KEY } from "@/lib/plan-intent";
import PlanSelector from "./PlanSelector";

const changePlan = vi.mocked(changePlanAction);
const startCheckout = vi.mocked(startPlanCheckoutAction);

const catalog = [
  {
    key: "free",
    name: "Free",
    price_cents_month: 0,
    max_clients: 3,
    max_active_projects: 3,
    max_leads: 25,
    max_team_members: 3,
    ai_monthly_budget_cents: 0,
  },
  {
    key: "pro",
    name: "Pro",
    price_cents_month: 14900,
    max_clients: 60,
    max_active_projects: 150,
    max_leads: 2000,
    max_team_members: 40,
    ai_monthly_budget_cents: 20000,
  },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  const location = { href: "", assign: vi.fn((url: string) => (location.href = url)) };
  Object.defineProperty(window, "location", { value: location, writable: true });
});

describe("PlanSelector", () => {
  it("renders every catalog plan with its limits", () => {
    render(<PlanSelector agencyId="a1" catalog={catalog} />);
    // Both the Free plan's name and its formatted price render "Free".
    expect(screen.getAllByText("Free")).toHaveLength(2);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("$149/mo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Free" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start with Pro" })).toBeInTheDocument();
  });

  it("switches to Free via changePlanAction and routes to the dashboard", async () => {
    changePlan.mockResolvedValueOnce({ subscription: {} as never });
    const user = userEvent.setup();
    render(<PlanSelector agencyId="a1" catalog={catalog} />);

    await user.click(screen.getByRole("button", { name: "Continue with Free" }));

    expect(changePlan).toHaveBeenCalledWith("a1", "free");
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("toasts an error from changePlanAction without routing away", async () => {
    changePlan.mockResolvedValueOnce({ error: "Something went wrong" });
    const user = userEvent.setup();
    render(<PlanSelector agencyId="a1" catalog={catalog} />);

    await user.click(screen.getByRole("button", { name: "Continue with Free" }));

    expect(toast.error).toHaveBeenCalledWith("Something went wrong");
    expect(push).not.toHaveBeenCalled();
  });

  it("starts a Checkout session for a paid plan, returning to the dashboard, and redirects", async () => {
    startCheckout.mockResolvedValueOnce({ redirectUrl: "https://checkout.stripe.test/abc" });
    const user = userEvent.setup();
    render(<PlanSelector agencyId="a1" catalog={catalog} />);

    await user.click(screen.getByRole("button", { name: "Start with Pro" }));

    expect(startCheckout).toHaveBeenCalledWith("a1", "pro", "/dashboard");
    expect(window.location.href).toBe("https://checkout.stripe.test/abc");
  });

  it("toasts an error from startPlanCheckoutAction", async () => {
    startCheckout.mockResolvedValueOnce({ error: "No Stripe price is configured" });
    const user = userEvent.setup();
    render(<PlanSelector agencyId="a1" catalog={catalog} />);

    await user.click(screen.getByRole("button", { name: "Start with Pro" }));

    expect(toast.error).toHaveBeenCalledWith("No Stripe price is configured");
    expect(window.location.href).toBe("");
  });

  it("highlights the plan matching a stashed intent from the pricing page, and clears it", async () => {
    window.localStorage.setItem(PLAN_INTENT_STORAGE_KEY, "pro");
    render(<PlanSelector agencyId="a1" catalog={catalog} />);

    expect(await screen.findByText("You were looking at this one")).toBeInTheDocument();
    expect(window.localStorage.getItem(PLAN_INTENT_STORAGE_KEY)).toBeNull();
  });

  it("shows no intent badge when nothing was stashed", () => {
    render(<PlanSelector agencyId="a1" catalog={catalog} />);
    expect(screen.queryByText("You were looking at this one")).not.toBeInTheDocument();
  });
});

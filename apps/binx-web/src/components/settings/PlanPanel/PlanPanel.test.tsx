import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/settings/plan/actions", () => ({
  openBillingPortalAction: vi.fn(),
  startPlanCheckoutAction: vi.fn(),
}));
vi.mock("@/lib/billing-client", () => ({
  formatLimit: (v: number | null) => (v == null ? "Unlimited" : String(v)),
  formatPlanPrice: (c: number) => (c === 0 ? "Free" : `$${c / 100}/mo`),
}));
vi.mock("@/lib/money", () => ({ formatMoneyCents: (c: number) => `$${(c / 100).toFixed(2)}` }));

import { openBillingPortalAction, startPlanCheckoutAction } from "@/app/(app)/settings/plan/actions";
import { toast } from "sonner";
import PlanPanel from "./PlanPanel";

const startCheckout = vi.mocked(startPlanCheckoutAction);
const openPortal = vi.mocked(openBillingPortalAction);

const catalog = [
  { key: "free", name: "Free", price_cents_month: 0, max_clients: 3, max_active_projects: 3, max_leads: 25, max_team_members: 3, ai_monthly_budget_cents: 0 },
  { key: "pro", name: "Pro", price_cents_month: 14900, max_clients: 60, max_active_projects: 150, max_leads: 2000, max_team_members: 40, ai_monthly_budget_cents: 20000 },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  const location = { href: "", assign: vi.fn((url: string) => (location.href = url)) };
  Object.defineProperty(window, "location", { value: location, writable: true });
  startCheckout.mockResolvedValue({ redirectUrl: "https://checkout.stripe.com/x" });
  openPortal.mockResolvedValue({ redirectUrl: "https://billing.stripe.com/x" });
});

describe("PlanPanel", () => {
  it("marks the current plan and offers a switch on the others (manager)", () => {
    render(
      <PlanPanel
        agencyId="a1"
        currentPlan="free"
        catalog={catalog}
        canManage
        hasStripeCustomer={false}
        hasStripeSubscription={false}
      />,
    );
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to this plan" })).toBeInTheDocument();
  });

  it("hides the switch button for a non-manager", () => {
    render(
      <PlanPanel
        agencyId="a1"
        currentPlan="free"
        catalog={catalog}
        canManage={false}
        hasStripeCustomer={false}
        hasStripeSubscription={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Switch to this plan" })).toBeNull();
  });

  it("hides the Manage billing link when there's no Stripe customer yet", () => {
    render(
      <PlanPanel
        agencyId="a1"
        currentPlan="free"
        catalog={catalog}
        canManage
        hasStripeCustomer={false}
        hasStripeSubscription={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Manage billing" })).toBeNull();
  });

  it("starts a Checkout session for a new subscriber and redirects", async () => {
    render(
      <PlanPanel
        agencyId="a1"
        currentPlan="free"
        catalog={catalog}
        canManage
        hasStripeCustomer={false}
        hasStripeSubscription={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch to this plan" }));
    expect(startCheckout).toHaveBeenCalledWith("a1", "pro");
    expect(openPortal).not.toHaveBeenCalled();
    expect(window.location.href).toBe("https://checkout.stripe.com/x");
  });

  it("opens the Billing Portal for an existing subscriber and redirects", async () => {
    render(
      <PlanPanel
        agencyId="a1"
        currentPlan="pro"
        catalog={catalog}
        canManage
        hasStripeCustomer
        hasStripeSubscription
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch to this plan" }));
    expect(openPortal).toHaveBeenCalledWith("a1", "free");
    expect(startCheckout).not.toHaveBeenCalled();
    expect(window.location.href).toBe("https://billing.stripe.com/x");
  });

  it("shows a Manage billing link once there's a Stripe customer, and it opens a plain portal session", async () => {
    render(
      <PlanPanel
        agencyId="a1"
        currentPlan="pro"
        catalog={catalog}
        canManage
        hasStripeCustomer
        hasStripeSubscription
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Manage billing" }));
    expect(openPortal).toHaveBeenCalledWith("a1");
    expect(window.location.href).toBe("https://billing.stripe.com/x");
  });

  it("toasts an error the action returns", async () => {
    startCheckout.mockResolvedValueOnce({ error: "No Stripe price is configured for the pro plan" });
    render(
      <PlanPanel
        agencyId="a1"
        currentPlan="free"
        catalog={catalog}
        canManage
        hasStripeCustomer={false}
        hasStripeSubscription={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch to this plan" }));
    expect(toast.error).toHaveBeenCalledWith("No Stripe price is configured for the pro plan");
    expect(window.location.href).toBe("");
  });
});

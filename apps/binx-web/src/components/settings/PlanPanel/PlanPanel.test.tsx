import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/settings/plan/actions", () => ({
  openBillingPortalAction: vi.fn(),
  startPlanCheckoutAction: vi.fn(),
  startPlanTrialAction: vi.fn(),
}));
vi.mock("@/lib/billing-client", () => ({
  formatLimit: (v: number | null) => (v == null ? "Unlimited" : String(v)),
  formatPlanPrice: (c: number) => (c === 0 ? "Free" : `$${c / 100}/mo`),
}));
vi.mock("@/lib/money", () => ({ formatMoneyCents: (c: number) => `$${(c / 100).toFixed(2)}` }));

import { openBillingPortalAction, startPlanCheckoutAction, startPlanTrialAction } from "@/app/(app)/settings/plan/actions";
import { toast } from "sonner";
import PlanPanel from "./PlanPanel";

const startCheckout = vi.mocked(startPlanCheckoutAction);
const openPortal = vi.mocked(openBillingPortalAction);
const startTrial = vi.mocked(startPlanTrialAction);

const catalog = [
  { key: "free", name: "Free", price_cents_month: 0, max_clients: 3, max_active_projects: 3, max_leads: 25, max_team_members: 3, ai_monthly_budget_cents: 0 },
  { key: "pro", name: "Pro", price_cents_month: 14900, max_clients: 60, max_active_projects: 150, max_leads: 2000, max_team_members: 40, ai_monthly_budget_cents: 20000 },
] as never;

const defaultProps = {
  agencyId: "a1",
  currentPlan: "free",
  catalog,
  canManage: true,
  hasStripeCustomer: false,
  hasStripeSubscription: false,
  isTrialing: false,
  trialPlan: null,
  trialEndsAt: null,
  hasUsedTrial: false,
  trialDiscountEligible: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  const location = { href: "", assign: vi.fn((url: string) => (location.href = url)) };
  Object.defineProperty(window, "location", { value: location, writable: true });
  startCheckout.mockResolvedValue({ redirectUrl: "https://checkout.stripe.com/x" });
  openPortal.mockResolvedValue({ redirectUrl: "https://billing.stripe.com/x" });
  startTrial.mockResolvedValue({ subscription: undefined });
});

describe("PlanPanel", () => {
  it("marks the current plan and offers a switch on the others (manager)", () => {
    render(<PlanPanel {...defaultProps} />);
    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to this plan" })).toBeInTheDocument();
  });

  it("hides the switch button for a non-manager", () => {
    render(<PlanPanel {...defaultProps} canManage={false} />);
    expect(screen.queryByRole("button", { name: "Switch to this plan" })).toBeNull();
  });

  it("hides the Manage billing link when there's no Stripe customer yet", () => {
    render(<PlanPanel {...defaultProps} />);
    expect(screen.queryByRole("button", { name: "Manage billing" })).toBeNull();
  });

  it("starts a Checkout session for a new subscriber and redirects", async () => {
    render(<PlanPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to this plan" }));
    expect(startCheckout).toHaveBeenCalledWith("a1", "pro");
    expect(openPortal).not.toHaveBeenCalled();
    expect(window.location.href).toBe("https://checkout.stripe.com/x");
  });

  it("opens the Billing Portal for an existing subscriber and redirects", async () => {
    render(
      <PlanPanel {...defaultProps} currentPlan="pro" hasStripeCustomer hasStripeSubscription />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch to this plan" }));
    expect(openPortal).toHaveBeenCalledWith("a1", "free");
    expect(startCheckout).not.toHaveBeenCalled();
    expect(window.location.href).toBe("https://billing.stripe.com/x");
  });

  it("shows a Manage billing link once there's a Stripe customer, and it opens a plain portal session", async () => {
    render(
      <PlanPanel {...defaultProps} currentPlan="pro" hasStripeCustomer hasStripeSubscription />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Manage billing" }));
    expect(openPortal).toHaveBeenCalledWith("a1");
    expect(window.location.href).toBe("https://billing.stripe.com/x");
  });

  it("toasts an error the action returns", async () => {
    startCheckout.mockResolvedValueOnce({ error: "No Stripe price is configured for the pro plan" });
    render(<PlanPanel {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Switch to this plan" }));
    expect(toast.error).toHaveBeenCalledWith("No Stripe price is configured for the pro plan");
    expect(window.location.href).toBe("");
  });

  it("offers a free trial on a paid plan that hasn't been trialed yet", async () => {
    render(<PlanPanel {...defaultProps} />);
    const trialButton = screen.getByRole("button", { name: "Start 14-day free trial" });
    await userEvent.click(trialButton);
    expect(startTrial).toHaveBeenCalledWith("a1", "pro");
  });

  it("hides the trial button once the agency has used its trial", () => {
    render(<PlanPanel {...defaultProps} hasUsedTrial />);
    expect(screen.queryByRole("button", { name: "Start 14-day free trial" })).toBeNull();
  });

  it("shows a trial banner with days left and marks the trialed plan", () => {
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    render(
      <PlanPanel
        {...defaultProps}
        isTrialing
        trialPlan="pro"
        trialEndsAt={trialEndsAt}
        hasUsedTrial
        trialDiscountEligible
      />,
    );
    expect(screen.getByText(/ends in 5 days/)).toBeInTheDocument();
    expect(screen.getByText(/20% off your first 3 months/)).toBeInTheDocument();
    expect(screen.getByText("Trialing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade now" })).toBeInTheDocument();
  });
});

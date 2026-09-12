import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/(app)/invoices/actions", () => ({ startStripeConnectOnboardingAction: vi.fn() }));

import { startStripeConnectOnboardingAction } from "@/app/(app)/invoices/actions";
import { toast } from "sonner";
import StripeConnectPanel from "./StripeConnectPanel";

const startOnboarding = vi.mocked(startStripeConnectOnboardingAction);

beforeEach(() => {
  vi.clearAllMocks();
  const location = { href: "", assign: vi.fn((url: string) => (location.href = url)) };
  Object.defineProperty(window, "location", { value: location, writable: true });
});

const notConnected = { connected: false, charges_enabled: false, details_submitted: false, payouts_enabled: false, onboarded_at: null };
const pending = { connected: true, charges_enabled: false, details_submitted: true, payouts_enabled: false, onboarded_at: null };
const active = {
  connected: true,
  charges_enabled: true,
  details_submitted: true,
  payouts_enabled: true,
  onboarded_at: "2026-01-15T00:00:00Z",
};

describe("StripeConnectPanel", () => {
  it("shows a Connect Stripe button when not connected (manager)", () => {
    render(<StripeConnectPanel agencyId="a1" status={notConnected as never} canManage />);
    expect(screen.getByText(/not connected to stripe/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Stripe" })).toBeInTheDocument();
  });

  it("shows Continue onboarding when pending (manager)", () => {
    render(<StripeConnectPanel agencyId="a1" status={pending as never} canManage />);
    expect(screen.getByText(/onboarding incomplete/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue onboarding" })).toBeInTheDocument();
  });

  it("shows the connected badge and onboarded-since date once active", () => {
    render(<StripeConnectPanel agencyId="a1" status={active as never} canManage />);
    expect(screen.getByText(/clients can pay invoices online/i)).toBeInTheDocument();
    expect(screen.getByText(/connected since/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hides the button and shows a note for a non-manager", () => {
    render(<StripeConnectPanel agencyId="a1" status={notConnected as never} canManage={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/an owner or admin needs to connect stripe/i)).toBeInTheDocument();
  });

  it("redirects to the onboarding URL on click", async () => {
    startOnboarding.mockResolvedValueOnce({ redirectUrl: "https://connect.stripe.com/setup/x" });
    render(<StripeConnectPanel agencyId="a1" status={notConnected as never} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Connect Stripe" }));
    expect(startOnboarding).toHaveBeenCalledWith("a1");
    expect(window.location.href).toBe("https://connect.stripe.com/setup/x");
  });

  it("toasts an error and does not redirect on failure", async () => {
    startOnboarding.mockResolvedValueOnce({ error: "Stripe isn't configured" });
    render(<StripeConnectPanel agencyId="a1" status={notConnected as never} canManage />);
    await userEvent.click(screen.getByRole("button", { name: "Connect Stripe" }));
    expect(toast.error).toHaveBeenCalledWith("Stripe isn't configured");
    expect(window.location.href).toBe("");
  });
});

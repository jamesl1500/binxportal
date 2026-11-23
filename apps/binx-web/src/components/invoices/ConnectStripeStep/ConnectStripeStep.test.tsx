import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/invoices/StripeConnectPanel/StripeConnectPanel", () => ({
  default: ({ agencyId, returnTo }: { agencyId: string; returnTo: string }) => (
    <div>
      panel-{agencyId}-{returnTo}
    </div>
  ),
}));

import ConnectStripeStep from "./ConnectStripeStep";

const base = {
  connected: false,
  charges_enabled: false,
  details_submitted: false,
  payouts_enabled: false,
  onboarded_at: null,
};

const props = {
  agencyId: "a1",
  agencyName: "Fjord & Field",
  canManage: true,
  returnTo: "onboarding" as const,
  justReturned: false,
};

describe("ConnectStripeStep", () => {
  it("connects this agency, says so, and can be skipped", () => {
    render(<ConnectStripeStep {...props} status={base as never} />);
    expect(screen.getByText("panel-a1-onboarding")).toBeInTheDocument();
    expect(screen.getByText(/for Fjord & Field only/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip for now" })).toHaveAttribute("href", "/dashboard");
  });

  it("reassures someone back from Stripe while it's still reviewing", () => {
    render(<ConnectStripeStep {...props} justReturned status={{ ...base, connected: true } as never} />);
    expect(screen.getByRole("status")).toHaveTextContent(/still be reviewing/);
  });

  it("moves on to the dashboard once payments are live", () => {
    render(
      <ConnectStripeStep {...props} justReturned status={{ ...base, connected: true, charges_enabled: true } as never} />,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute("href", "/dashboard");
  });
});

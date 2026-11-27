import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadConnect = vi.hoisted(() => vi.fn());
vi.mock("@stripe/connect-js", () => ({ loadConnectAndInitialize: loadConnect }));
vi.mock("@stripe/react-connect-js", () => ({
  ConnectComponentsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="connect-provider">{children}</div>
  ),
  ConnectPayouts: () => <div>Stripe payouts</div>,
}));
vi.mock("@/app/(app)/settings/payouts/actions", () => ({ startPayoutsSessionAction: vi.fn() }));

import { startPayoutsSessionAction } from "@/app/(app)/settings/payouts/actions";

import StripePayoutsPanel from "./StripePayoutsPanel";

const mockedStart = vi.mocked(startPayoutsSessionAction);

beforeEach(() => {
  vi.clearAllMocks();
  loadConnect.mockReturnValue({});
});

describe("StripePayoutsPanel", () => {
  it("opens Stripe's Payouts component with the agency's session", async () => {
    mockedStart.mockResolvedValueOnce({ clientSecret: "accs_1", publishableKey: "pk_test_1" });
    render(<StripePayoutsPanel agencyId="a1" />);

    expect(screen.getByText("Opening your payouts…")).toBeInTheDocument();
    expect(await screen.findByText("Stripe payouts")).toBeInTheDocument();
    expect(mockedStart).toHaveBeenCalledWith("a1");
    const options = loadConnect.mock.calls[0][0];
    expect(options.publishableKey).toBe("pk_test_1");

    // The first secret is used once; after that each request gets a new one.
    await expect(options.fetchClientSecret()).resolves.toBe("accs_1");
    mockedStart.mockResolvedValueOnce({ clientSecret: "accs_2", publishableKey: "pk_test_1" });
    await expect(options.fetchClientSecret()).resolves.toBe("accs_2");
    mockedStart.mockResolvedValueOnce({ error: "Connect Stripe to see your payouts" });
    const failure = await options.fetchClientSecret().catch((caught: unknown) => caught);
    expect(String((failure as Error)?.message ?? failure)).toContain("Connect Stripe to see your payouts");
  });

  it("says why it couldn't open", async () => {
    mockedStart.mockResolvedValueOnce({ error: "We couldn't open your payouts just now." });
    render(<StripePayoutsPanel agencyId="a1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't open your payouts just now.");
    expect(loadConnect).not.toHaveBeenCalled();
  });
});

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/proposals/public/actions", () => ({
  startDepositCheckoutAction: vi.fn(),
  confirmDepositAction: vi.fn(),
}));

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const mockedToast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockedToast }));

import { confirmDepositAction, startDepositCheckoutAction } from "@/app/proposals/public/actions";
import type { ProposalDeposit } from "@/lib/proposals";

import DepositPanel from "./DepositPanel";

const mockedStart = vi.mocked(startDepositCheckoutAction);
const mockedConfirm = vi.mocked(confirmDepositAction);

function deposit(overrides: Partial<ProposalDeposit> = {}): ProposalDeposit {
  return {
    status: "due",
    amount_cents: 300_000,
    currency: "USD",
    invoice_number: "INV-0007",
    invoice_id: null,
    pay_online: true,
    ...overrides,
  };
}

const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", { value: { assign }, writable: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DepositPanel", () => {
  it("sends the signer to Stripe Checkout to pay", async () => {
    mockedStart.mockResolvedValueOnce({ checkoutUrl: "https://checkout.stripe.test/s" });
    const user = userEvent.setup();
    render(<DepositPanel deposit={deposit()} agencyName="Northlight" token="tok" />);

    expect(screen.getByRole("heading", { name: "Deposit: $3,000.00" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pay $3,000.00 deposit" }));
    expect(mockedStart).toHaveBeenCalledWith("tok");
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/s");
  });

  it("says why it couldn't start", async () => {
    mockedStart.mockResolvedValueOnce({ error: "Online payment isn't set up for this agency yet" });
    const user = userEvent.setup();
    render(<DepositPanel deposit={deposit()} agencyName="Northlight" token="tok" />);
    await user.click(screen.getByRole("button", { name: /Pay/ }));
    expect(mockedToast.error).toHaveBeenCalledWith("Online payment isn't set up for this agency yet");
    expect(assign).not.toHaveBeenCalled();
  });

  it("points to the invoice when the agency doesn't take payments online", () => {
    render(<DepositPanel deposit={deposit({ pay_online: false })} agencyName="Northlight" token="tok" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/Northlight has sent you invoice INV-0007/)).toBeInTheDocument();
  });

  it("links to the portal invoice from the portal", () => {
    render(
      <DepositPanel
        deposit={deposit({ invoice_id: "inv-1" })}
        agencyName="Northlight"
        invoiceHref="/portal/invoices/inv-1"
      />,
    );
    expect(screen.getByRole("link", { name: "Pay $3,000.00 deposit" })).toHaveAttribute("href", "/portal/invoices/inv-1");
  });

  it("shows paid, waiting on the countersignature, and stopped", () => {
    const { rerender } = render(<DepositPanel deposit={deposit({ status: "paid" })} agencyName="Northlight" token="tok" />);
    expect(screen.getByRole("heading", { name: "Deposit paid" })).toBeInTheDocument();

    rerender(<DepositPanel deposit={deposit({ status: "awaiting_countersign" })} agencyName="Northlight" token="tok" />);
    expect(screen.getByText(/once Northlight has countersigned/)).toBeInTheDocument();

    rerender(<DepositPanel deposit={deposit({ status: "unavailable" })} agencyName="Northlight" token="tok" />);
    expect(screen.getByText(/Northlight will be in touch/)).toBeInTheDocument();
  });

  it("refreshes while the deposit invoice is being prepared, then stops", () => {
    vi.useFakeTimers();
    render(<DepositPanel deposit={deposit({ status: "preparing" })} agencyName="Northlight" token="tok" />);
    expect(screen.getByText("Preparing your deposit invoice…")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1500 * 3));
    expect(router.refresh).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(1500 * 40));
    expect(router.refresh).toHaveBeenCalledTimes(20);
  });

  it("confirms the payment once on the way back from Stripe, then tidies the URL", async () => {
    mockedConfirm.mockResolvedValue({ outcome: "paid" });
    const { rerender } = render(
      <DepositPanel
        deposit={deposit()}
        agencyName="Northlight"
        token="tok"
        returned={{ outcome: "paid", sessionId: "cs_1" }}
      />,
    );
    await vi.waitFor(() => expect(mockedToast.success).toHaveBeenCalledWith("Deposit paid. Thank you!"));
    expect(mockedConfirm).toHaveBeenCalledWith("tok", "cs_1");
    expect(router.replace).toHaveBeenCalledWith("/proposals/public?token=tok", { scroll: false });

    rerender(
      <DepositPanel deposit={deposit({ status: "paid" })} agencyName="Northlight" token="tok" returned={{ outcome: "paid", sessionId: "cs_1" }} />,
    );
    expect(mockedConfirm).toHaveBeenCalledTimes(1);
  });

  it("explains a payment that's still processing, and one that was cancelled", async () => {
    mockedConfirm.mockResolvedValueOnce({ outcome: "processing" });
    render(
      <DepositPanel deposit={deposit()} agencyName="Northlight" token="tok" returned={{ outcome: "paid", sessionId: "cs_2" }} />,
    );
    expect(await screen.findByText(/Your payment is processing/)).toBeInTheDocument();

    render(<DepositPanel deposit={deposit()} agencyName="Northlight" token="t2" returned={{ outcome: "cancelled" }} />);
    expect(mockedToast).toHaveBeenCalledWith("Payment cancelled. You can pay whenever you're ready.");
    expect(router.replace).toHaveBeenCalledWith("/proposals/public?token=t2", { scroll: false });
  });
});

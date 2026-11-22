"""Fees on client-invoice payments made online through the portal.

Two fees come out of an online payment, and neither is added to what the
client pays:

- **Binx's platform fee**: ``PLATFORM_FEE_BPS`` of the amount, collected as
  the Checkout Session's ``application_fee_amount``. Stripe moves it from the
  agency's connected account to the platform when the charge settles.
- **Stripe's processing fee**: the connected account is set up with
  ``fees_collector: "stripe"`` (see service.start_connect_onboarding), so
  Stripe charges its own fee to the agency's account directly. Binx doesn't
  set or collect it. The real amount is read from the charge's balance
  transaction once the payment is recorded; until then, staff see an
  estimate at Stripe's standard US card rate.

Payments staff record by hand (bank transfer, check, cash) never pass
through Stripe and carry no fees.

The marketing site states the same rate. Keep apps/binx-web/src/lib/payment-fees.ts
in step with these constants.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# 1.25% of every invoice payment made online.
PLATFORM_FEE_BPS = 125

# Stripe's standard US card rate (2.9% + 30¢), used only for estimates.
# International cards, currency conversion and other payment methods cost
# differently; the recorded payment shows the real fee.
STRIPE_ESTIMATE_BPS = 290
STRIPE_ESTIMATE_FIXED_CENTS = 30


def _bps_of(amount_cents: int, bps: int) -> int:
    return int((Decimal(amount_cents) * Decimal(bps) / Decimal(10_000)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def platform_fee_cents(amount_cents: int) -> int:
    """Binx's cut of an online payment, rounded half-up to the cent."""
    if amount_cents <= 0:
        return 0
    return _bps_of(amount_cents, PLATFORM_FEE_BPS)


def estimated_stripe_fee_cents(amount_cents: int) -> int:
    """What Stripe would likely charge for a US card payment of this amount,
    capped at the amount itself."""
    if amount_cents <= 0:
        return 0
    return min(amount_cents, _bps_of(amount_cents, STRIPE_ESTIMATE_BPS) + STRIPE_ESTIMATE_FIXED_CENTS)


@dataclass(frozen=True)
class FeeBreakdown:
    gross_cents: int
    stripe_fee_cents: int
    platform_fee_cents: int
    # True when any part of stripe_fee_cents is an estimate rather than the
    # fee Stripe actually charged.
    stripe_fee_estimated: bool

    @property
    def net_cents(self) -> int:
        return self.gross_cents - self.stripe_fee_cents - self.platform_fee_cents

    def __add__(self, other: FeeBreakdown) -> FeeBreakdown:
        return FeeBreakdown(
            gross_cents=self.gross_cents + other.gross_cents,
            stripe_fee_cents=self.stripe_fee_cents + other.stripe_fee_cents,
            platform_fee_cents=self.platform_fee_cents + other.platform_fee_cents,
            stripe_fee_estimated=self.stripe_fee_estimated or other.stripe_fee_estimated,
        )


def estimate(amount_cents: int) -> FeeBreakdown:
    """The breakdown for an amount that hasn't been paid yet."""
    return FeeBreakdown(
        gross_cents=amount_cents,
        stripe_fee_cents=estimated_stripe_fee_cents(amount_cents),
        platform_fee_cents=platform_fee_cents(amount_cents),
        stripe_fee_estimated=True,
    )


def recorded(amount_cents: int, *, stripe_fee_cents: int | None, platform_fee_cents: int | None) -> FeeBreakdown:
    """The breakdown for an online payment that has been recorded.

    A missing Stripe fee (the balance transaction couldn't be read) falls
    back to the estimate. A missing platform fee means the payment predates
    the fee, when Binx charged nothing, so it counts as zero.
    """
    return FeeBreakdown(
        gross_cents=amount_cents,
        stripe_fee_cents=stripe_fee_cents if stripe_fee_cents is not None else estimated_stripe_fee_cents(amount_cents),
        platform_fee_cents=platform_fee_cents or 0,
        stripe_fee_estimated=stripe_fee_cents is None,
    )

"""The fee math behind online invoice payments (invoicing/fees.py)."""

from __future__ import annotations

import pytest

from binx_api.modules.invoicing import fees

pytestmark = pytest.mark.unit


class TestPlatformFee:
    def test_is_one_and_a_quarter_percent(self) -> None:
        assert fees.PLATFORM_FEE_BPS == 125
        assert fees.platform_fee_cents(10_000) == 125  # $100.00 -> $1.25
        assert fees.platform_fee_cents(123_456) == 1_543  # 1543.2 -> 1543

    def test_rounds_half_up_to_the_cent(self) -> None:
        assert fees.platform_fee_cents(40) == 1  # 0.5 -> 1
        assert fees.platform_fee_cents(39) == 0  # 0.4875 -> 0
        assert fees.platform_fee_cents(120) == 2  # 1.5 -> 2

    @pytest.mark.parametrize("amount", [0, -500])
    def test_nothing_on_nothing(self, amount: int) -> None:
        assert fees.platform_fee_cents(amount) == 0


class TestStripeEstimate:
    def test_is_the_standard_us_card_rate(self) -> None:
        assert fees.estimated_stripe_fee_cents(10_000) == 320  # 2.9% + 30c

    def test_never_exceeds_the_amount(self) -> None:
        assert fees.estimated_stripe_fee_cents(20) == 20

    def test_nothing_on_nothing(self) -> None:
        assert fees.estimated_stripe_fee_cents(0) == 0


class TestBreakdowns:
    def test_estimate_nets_out_both_fees(self) -> None:
        breakdown = fees.estimate(250_000)  # $2,500.00
        assert breakdown.platform_fee_cents == 3_125
        assert breakdown.stripe_fee_cents == 7_280
        assert breakdown.net_cents == 250_000 - 3_125 - 7_280
        assert breakdown.stripe_fee_estimated is True

    def test_recorded_uses_the_real_fees(self) -> None:
        breakdown = fees.recorded(10_000, stripe_fee_cents=345, platform_fee_cents=125)
        assert breakdown.net_cents == 9_530
        assert breakdown.stripe_fee_estimated is False

    def test_recorded_estimates_a_missing_stripe_fee(self) -> None:
        breakdown = fees.recorded(10_000, stripe_fee_cents=None, platform_fee_cents=125)
        assert breakdown.stripe_fee_cents == 320
        assert breakdown.stripe_fee_estimated is True

    def test_a_payment_from_before_the_fee_owes_no_platform_fee(self) -> None:
        breakdown = fees.recorded(10_000, stripe_fee_cents=320, platform_fee_cents=None)
        assert breakdown.platform_fee_cents == 0
        assert breakdown.net_cents == 9_680

    def test_adding_keeps_the_estimated_flag(self) -> None:
        real = fees.recorded(10_000, stripe_fee_cents=320, platform_fee_cents=125)
        guessed = fees.recorded(5_000, stripe_fee_cents=None, platform_fee_cents=63)
        total = real + guessed
        assert total.gross_cents == 15_000
        assert total.platform_fee_cents == 188
        assert total.stripe_fee_cents == 320 + 175
        assert total.net_cents == 15_000 - 188 - 495
        assert total.stripe_fee_estimated is True
        assert (real + real).stripe_fee_estimated is False

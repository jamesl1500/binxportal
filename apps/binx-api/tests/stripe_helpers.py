"""Test helpers for Stripe — no real Stripe involved anywhere.

- ``sign_stripe_payload`` signs a fake webhook payload the same way
  ``stripe.Webhook.construct_event`` verifies it (pure local HMAC). Shared by
  the billing and invoicing webhook tests (see core/stripe_events.py for the
  verification side).
- ``make_*`` build real SDK objects from plain dicts (``construct_from``, the
  same path the SDK uses to parse an API response) — so service code under
  test sees exactly the classes and attribute access it gets in production,
  rather than a ``SimpleNamespace`` that might not behave the same.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import stripe

_KEY = "sk_test_helpers"


def make_subscription(
    *,
    id: str = "sub_123",
    customer: str = "cus_123",
    status: str = "active",
    cancel_at_period_end: bool = False,
    price_id: str = "price_pro",
    item_id: str = "si_1",
    current_period_end: int | None = 2_000_000_000,
) -> stripe.Subscription:
    return stripe.Subscription.construct_from(
        {
            "id": id,
            "object": "subscription",
            "customer": customer,
            "status": status,
            "cancel_at_period_end": cancel_at_period_end,
            "items": {
                "object": "list",
                "data": [
                    {
                        "object": "subscription_item",
                        "id": item_id,
                        "price": {"object": "price", "id": price_id},
                        "current_period_end": current_period_end,
                    }
                ],
            },
        },
        _KEY,
    )


def make_checkout_session(**fields: Any) -> stripe.checkout.Session:
    return stripe.checkout.Session.construct_from({"object": "checkout.session", **fields}, _KEY)


def make_v2_account(
    account_id: str, *, card_payments_active: bool, payouts_active: bool, has_merchant: bool = True
) -> stripe.v2.core.Account:
    """A v2 Core Account as ``sync_connect_status`` reads it —
    ``configuration.merchant`` is ``None`` until the Merchant configuration
    has actually been applied."""
    merchant = (
        {
            "capabilities": {
                "card_payments": {"status": "active" if card_payments_active else "restricted"},
                "stripe_balance": {"payouts": {"status": "active" if payouts_active else "restricted"}},
            }
        }
        if has_merchant
        else None
    )
    return stripe.v2.core.Account.construct_from(
        {"id": account_id, "object": "v2.core.account", "configuration": {"merchant": merchant}}, _KEY
    )


def sign_stripe_payload(payload: dict[str, Any], secret: str) -> tuple[bytes, str]:
    """Returns ``(raw_body_bytes, stripe_signature_header_value)`` — pass the
    body as ``content=`` and the header as ``headers={"stripe-signature": ...}``
    on the test client's POST."""
    body = json.dumps(payload).encode()
    timestamp = int(time.time())
    signed_payload = f"{timestamp}.".encode() + body
    signature = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return body, f"t={timestamp},v1={signature}"

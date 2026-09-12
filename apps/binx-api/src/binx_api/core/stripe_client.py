"""The shared entry point into Stripe. Every Stripe call in billing/service.py
and invoicing/service.py goes through one of the thin wrapper functions here —
nothing else imports ``stripe`` directly. Mirrors ai/client.py's
``_call_anthropic`` pattern: one monkeypatchable function per real network
call, so tests can patch exactly the calls they need without depending on the
real SDK's response shapes.

Uses the modern ``stripe.StripeClient`` (instance-scoped API key, async
methods under ``.v1``) rather than the legacy global ``stripe.api_key``
mutation — avoids one process's key leaking across requests/tests. The
``.v1`` namespace specifically avoids stripe-python's deprecation warning on
the client's top-level resource accessors (this codebase's pytest config
turns warnings into errors).
"""

from __future__ import annotations

from typing import Any

import stripe

from binx_api.core.config import get_settings

settings = get_settings()

_client: stripe.StripeClient | None = None


def _get_client() -> stripe.StripeClient:
    global _client
    if _client is None:
        _client = stripe.StripeClient(api_key=settings.stripe_secret_key or "sk_test_unconfigured")
    return _client


async def create_customer(params: dict[str, Any]) -> stripe.Customer:
    return await _get_client().v1.customers.create_async(params)


async def create_checkout_session(
    params: dict[str, Any], *, stripe_account: str | None = None
) -> stripe.checkout.Session:
    """``stripe_account`` targets a Connect connected account (the "direct
    charge" pattern) — omitted for platform-subscription checkouts."""
    options = {"stripe_account": stripe_account} if stripe_account else None
    return await _get_client().v1.checkout.sessions.create_async(params, options)


async def create_billing_portal_session(params: dict[str, Any]) -> stripe.billing_portal.Session:
    return await _get_client().v1.billing_portal.sessions.create_async(params)


async def retrieve_subscription(subscription_id: str) -> stripe.Subscription:
    return await _get_client().v1.subscriptions.retrieve_async(subscription_id)


async def create_connect_account(params: dict[str, Any]) -> stripe.Account:
    return await _get_client().v1.accounts.create_async(params)


async def retrieve_connect_account(account_id: str) -> stripe.Account:
    return await _get_client().v1.accounts.retrieve_async(account_id)


async def create_account_link(params: dict[str, Any]) -> stripe.AccountLink:
    return await _get_client().v1.account_links.create_async(params)


def construct_event(payload: bytes, sig_header: str, secret: str) -> stripe.Event:
    """Pure local HMAC verification — no network call. Raises ``ValueError``
    (malformed payload) or ``stripe.SignatureVerificationError`` (bad/missing
    signature); both are caught by core/stripe_events.py::verify_and_dedupe."""
    return stripe.Webhook.construct_event(payload, sig_header, secret)

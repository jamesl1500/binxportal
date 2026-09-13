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


# Connect accounts use the v2 Core Accounts API (`/v2/core/accounts`), not
# the legacy v1 `/v1/accounts` — new Stripe accounts reject v1 account
# creation outright ("Stripe no longer recommends Accounts v1 for new
# Connect integrations"). Account Links (hosted onboarding) are v2-native
# too (`.v2.core.account_links`, not `.v1.account_links` — the v1 endpoint
# doesn't accept a v2-created account id).
async def create_connect_account(params: dict[str, Any]) -> stripe.v2.core.Account:
    return await _get_client().v2.core.accounts.create_async(params)


async def retrieve_connect_account(account_id: str, params: dict[str, Any] | None = None) -> stripe.v2.core.Account:
    return await _get_client().v2.core.accounts.retrieve_async(account_id, params)


async def create_account_link(params: dict[str, Any]) -> stripe.v2.core.AccountLink:
    return await _get_client().v2.core.account_links.create_async(params)


def construct_event(payload: bytes, sig_header: str, secret: str) -> stripe.Event:
    """Pure local HMAC verification — no network call. Raises ``ValueError``
    (malformed payload) or ``stripe.SignatureVerificationError`` (bad/missing
    signature); both are caught by core/stripe_events.py::verify_and_dedupe."""
    return stripe.Webhook.construct_event(payload, sig_header, secret)


def parse_connect_account_event_notification(payload: bytes, sig_header: str, secret: str):
    """Verifies + parses a v2 Core Account **thin event** notification (sent
    to a separate Stripe "event destination", with its own signing secret,
    from the v1 Connect webhook `construct_event` above handles). The
    notification only carries a reference to the changed Account — the
    caller fetches the current object itself, e.g. via
    ``notification.fetch_related_object_async()``. Same underlying HMAC
    verification as ``construct_event``, so it raises the same
    ``ValueError``/``stripe.SignatureVerificationError``."""
    return _get_client().parse_event_notification(payload, sig_header, secret)

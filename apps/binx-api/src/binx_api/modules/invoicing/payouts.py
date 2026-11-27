"""Payouts: an agency's own Stripe balance and payouts, inside Binx.

Online invoice payments land in the agency's own connected Stripe account
(direct charges, see service.start_invoice_checkout), and Stripe pays them
out to the agency's bank. This lets owners and admins see that balance and
those payouts, change the payout schedule, and pay out now (standard, or
instant where Stripe allows it), without leaving Binx.

It's Stripe's own embedded Payouts component (Connect.js) in the web app,
backed by a short-lived Account Session minted here. Stripe enforces what
the session allows, and because agencies have the full Stripe Dashboard,
Stripe asks the person to sign in to Stripe inside the component before it
shows or moves money. Binx never holds the agency's bank details or moves
their money itself.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import stripe
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import stripe_client
from binx_api.core.config import get_settings
from binx_api.core.errors import UpstreamError
from binx_api.modules.agencies.models import Agency
from binx_api.modules.invoicing import service

settings = get_settings()

PAYOUTS_UNAVAILABLE = (
    "We couldn't open your payouts just now. It's a problem on our side, not with your Stripe account; "
    "we've been notified. Please try again later."
)


@dataclass(frozen=True)
class PayoutsSession:
    client_secret: str
    publishable_key: str
    expires_at: datetime


async def start_payouts_session(db: AsyncSession, agency: Agency) -> PayoutsSession:
    """A single-use Account Session for the Payouts component on this
    agency's connected account. 409 until the agency has connected Stripe."""
    if not settings.stripe_secret_key or not settings.stripe_publishable_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe isn't configured")
    billing_settings = await service.get_or_create_billing_settings(db, agency)
    account_id = billing_settings.stripe_connect_account_id
    if account_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Connect Stripe to see your payouts")

    try:
        session = await stripe_client.create_account_session(
            {
                "account": account_id,
                "components": {
                    "payouts": {
                        "enabled": True,
                        "features": {
                            # Stripe still decides per account (the schedule
                            # must be manual for standard payouts; instant
                            # payouts need an eligible debit card).
                            "standard_payouts": True,
                            "instant_payouts": True,
                            "edit_payout_schedule": True,
                            "external_account_collection": True,
                        },
                    },
                    # Opened from a row of the payouts table.
                    "payout_details": {"enabled": True},
                },
            }
        )
    except stripe.StripeError as exc:
        raise UpstreamError(PAYOUTS_UNAVAILABLE, service="stripe", code="stripe_payouts_unavailable") from exc

    return PayoutsSession(
        client_secret=session.client_secret,
        publishable_key=settings.stripe_publishable_key,
        expires_at=datetime.fromtimestamp(session.expires_at, tz=UTC),
    )

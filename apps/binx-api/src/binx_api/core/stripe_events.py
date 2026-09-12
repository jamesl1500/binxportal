"""Stripe webhook signature verification + replay protection — shared by
billing/webhooks_router.py (platform events) and invoicing/webhooks_router.py
(Connect events). One ledger table for both: Stripe explicitly documents that
events can be redelivered, so every handler must be idempotent, and there's no
feature-specific reason to duplicate that bookkeeping per module.
"""

from __future__ import annotations

import uuid

import stripe
from fastapi import HTTPException, Request, status
from sqlalchemy import String, Uuid
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base
from binx_api.core.stripe_client import construct_event


class StripeWebhookEvent(Base):
    __tablename__ = "stripe_webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    stripe_event_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100))
    # Set for Connect events (the connected account the event happened on);
    # null for platform events.
    connect_account_id: Mapped[str | None] = mapped_column(String(255), default=None)


async def verify_and_dedupe(request: Request, db: AsyncSession, secret: str | None) -> stripe.Event | None:
    """Verifies the raw request against ``secret`` and records the event id.
    Returns the parsed event, or ``None`` when it's a replay Stripe has
    already delivered (the caller should treat that as a no-op 200, not an
    error — Stripe retries on anything but a 2xx).

    Reads ``request.body()`` directly rather than a parsed Pydantic model:
    Stripe's HMAC is computed over the exact bytes it sent, and re-serializing
    JSON (even losslessly) can change byte-for-byte equality and break
    verification.
    """
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe isn't configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = construct_event(payload, sig_header, secret)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Stripe signature") from exc

    db.add(
        StripeWebhookEvent(
            stripe_event_id=event.id,
            event_type=event.type,
            connect_account_id=getattr(event, "account", None),
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return None
    return event

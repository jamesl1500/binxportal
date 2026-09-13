"""Stripe webhook signature verification + replay protection — shared by
billing/webhooks_router.py (platform events), invoicing/webhooks_router.py's
v1 Connect endpoint (checkout.session.completed), and its v2 Core Account
event-destination endpoint (verify_and_dedupe_thin_event, below). One ledger
table for all of them: Stripe explicitly documents that events can be
redelivered, so every handler must be idempotent, and there's no
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
from binx_api.core.stripe_client import construct_event, parse_connect_account_event_notification


class StripeWebhookEvent(Base):
    __tablename__ = "stripe_webhook_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    stripe_event_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100))
    # Set for Connect events (the connected account the event happened on);
    # null for platform events.
    connect_account_id: Mapped[str | None] = mapped_column(String(255), default=None)


async def verify_and_dedupe(request: Request, db: AsyncSession, secret: str | None) -> stripe.Event | None:
    """Verifies the raw request against ``secret`` and stages the event id for
    insertion. Returns the parsed event, or ``None`` when it's a replay Stripe
    has already delivered (the caller should treat that as a no-op 200, not an
    error — Stripe retries on anything but a 2xx).

    Deliberately does **not** commit here — only ``flush()``es, so the
    uniqueness check still runs immediately (a genuine replay still comes back
    ``None``), but the ledger row only becomes durable once the caller's own
    handler commits *its* side effects. If the handler raises before
    committing, the whole session rolls back together (FastAPI's ``DbSession``
    dependency never auto-commits — see core/database.py::get_db), so the
    ledger row disappears too and Stripe's retry gets a genuine second
    attempt instead of being silently swallowed as "already seen". Committing
    the ledger row unconditionally, before the handler even runs, was exactly
    the bug that let a client's real Stripe payment succeed while the invoice
    stayed unpaid — the ledger said "handled" for an event whose handler never
    actually finished.

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
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return None
    return event


async def verify_and_dedupe_thin_event(request: Request, db: AsyncSession, secret: str | None):
    """The v2 Core Account "event destination" equivalent of
    ``verify_and_dedupe`` above — same replay-protection ledger (and the same
    flush-not-commit contract: the ledger row only becomes durable alongside
    the caller's own handler commit, so a failed handler doesn't permanently
    eat the event — see ``verify_and_dedupe``'s docstring), but for a **thin**
    event notification (no embedded object; the caller fetches the current
    one itself, e.g. via ``notification.fetch_related_object_async()``).
    Returns ``None`` on a replay, same contract as ``verify_and_dedupe``."""
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe isn't configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        notification = parse_connect_account_event_notification(payload, sig_header, secret)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Stripe signature") from exc

    db.add(
        StripeWebhookEvent(
            stripe_event_id=notification.id,
            event_type=notification.type,
            connect_account_id=getattr(notification, "related_object", None) and notification.related_object.id,
        )
    )
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return None
    return notification

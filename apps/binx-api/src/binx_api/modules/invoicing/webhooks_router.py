"""Stripe **Connect** webhooks — events on a connected account (an agency's
own Stripe account). Two separate endpoints, each with its own signing
secret, from the platform-billing webhook (billing/webhooks_router.py) and
from each other:

- ``/connect``: the v1 webhook endpoint, for ``checkout.session.completed``
  (client-invoice payments — still a v1 Checkout Session regardless of the
  connected account's own API version).
- ``/connect-account``: the v2 Core Account event destination, for
  ``v2.core.account.updated`` (onboarding/capability-status changes) — a thin
  event, so the handler fetches the current Account itself rather than
  reading one embedded in the payload.

See ``core/stripe_events.py`` for signature verification + replay protection.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from binx_api.core.config import get_settings
from binx_api.core.dependencies import DbSession
from binx_api.core.stripe_events import verify_and_dedupe, verify_and_dedupe_thin_event
from binx_api.modules.invoicing import service
from binx_api.modules.invoicing.models import InvoicePayment
from binx_api.modules.users.models import User

router = APIRouter(prefix="/webhooks/stripe", tags=["invoicing-webhooks"])
settings = get_settings()


async def _handle_checkout_completed(db: DbSession, session) -> None:
    if session.mode != "payment":
        return  # not an invoice-payment session (shouldn't occur on this endpoint, but never assume)

    # StripeObject isn't a real dict (no .get()) — .to_dict() gives us one.
    metadata = session.metadata.to_dict() if session.metadata else {}
    invoice_id = metadata.get("invoice_id")
    agency_id = metadata.get("agency_id")
    if invoice_id is None or agency_id is None:
        return

    existing = await db.execute(
        select(InvoicePayment.id).where(InvoicePayment.stripe_payment_intent_id == session.payment_intent)
    )
    if existing.scalar_one_or_none() is not None:
        return  # already recorded — a second event referencing the same PaymentIntent

    invoice = await service.get_invoice_or_404(db, uuid.UUID(agency_id), uuid.UUID(invoice_id))

    paid_by_user_id = metadata.get("paid_by_user_id")
    recorded_by = await db.get(User, uuid.UUID(paid_by_user_id)) if paid_by_user_id else None

    await service.add_payment(
        db,
        invoice,
        recorded_by=recorded_by,
        amount_cents=session.amount_total,
        paid_on=datetime.now(UTC).date(),
        method="stripe",
        reference=None,
        stripe_payment_intent_id=session.payment_intent,
        stripe_checkout_session_id=session.id,
    )


@router.post("/connect")
async def connect_webhook(request: Request, db: DbSession) -> Response:
    event = await verify_and_dedupe(request, db, settings.stripe_connect_webhook_secret)
    if event is None:
        return Response(status_code=200)

    if event.type == "checkout.session.completed":
        await _handle_checkout_completed(db, event.data.object)

    return Response(status_code=200)


@router.post("/connect-account")
async def connect_account_webhook(request: Request, db: DbSession) -> Response:
    notification = await verify_and_dedupe_thin_event(request, db, settings.stripe_connect_account_webhook_secret)
    if notification is None:
        return Response(status_code=200)

    if notification.type == "v2.core.account.updated":
        account = await notification.fetch_related_object_async()
        await service.sync_connect_status(db, account)

    return Response(status_code=200)

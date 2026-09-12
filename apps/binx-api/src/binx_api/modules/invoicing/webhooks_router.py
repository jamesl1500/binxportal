"""Stripe **Connect** webhook — events on a connected account (an agency's
own Stripe account), arriving on a separate endpoint with a separate signing
secret from the platform-billing webhook (billing/webhooks_router.py). See
``core/stripe_events.py`` for signature verification + replay protection.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from binx_api.core.config import get_settings
from binx_api.core.dependencies import DbSession
from binx_api.core.stripe_events import verify_and_dedupe
from binx_api.modules.invoicing import service
from binx_api.modules.invoicing.models import InvoicePayment
from binx_api.modules.users.models import User

router = APIRouter(prefix="/webhooks/stripe", tags=["invoicing-webhooks"])
settings = get_settings()


async def _handle_account_updated(db: DbSession, account) -> None:
    await service.sync_connect_status(db, account)


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

    if event.type == "account.updated":
        await _handle_account_updated(db, event.data.object)
    elif event.type == "checkout.session.completed":
        await _handle_checkout_completed(db, event.data.object)

    return Response(status_code=200)

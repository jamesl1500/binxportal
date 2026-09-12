"""Stripe **platform** webhook — subscription lifecycle events for Binx's own
agency billing. Distinct endpoint/secret from the Connect webhook
(invoicing/webhooks_router.py), which carries client-invoice-payment events
on agencies' own connected accounts. See core/stripe_events.py for signature
verification + replay protection.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from binx_api.core.config import get_settings
from binx_api.core.dependencies import DbSession
from binx_api.core.stripe_events import verify_and_dedupe
from binx_api.modules.billing import service

router = APIRouter(prefix="/webhooks/stripe", tags=["billing-webhooks"])
settings = get_settings()


@router.post("/platform")
async def platform_webhook(request: Request, db: DbSession) -> Response:
    event = await verify_and_dedupe(request, db, settings.stripe_webhook_secret)
    if event is None:
        return Response(status_code=200)

    match event.type:
        case "checkout.session.completed":
            await service.sync_from_checkout_completed(db, event.data.object)
        case "customer.subscription.updated":
            await service.sync_from_subscription_event(db, event.data.object)
        case "customer.subscription.deleted":
            await service.sync_from_subscription_deleted(db, event.data.object)
        case "invoice.payment_failed":
            await service.mark_payment_failed(db, event.data.object.customer)

    return Response(status_code=200)

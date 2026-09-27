"""Stripe **Connect** webhooks — events on a connected account (an agency's
own Stripe account). Two separate endpoints, each with its own signing
secret, from the platform-billing webhook (billing/webhooks_router.py) and
from each other:

- ``/connect``: the v1 webhook endpoint, for ``checkout.session.completed``
  / ``checkout.session.async_payment_succeeded`` (client-invoice payments —
  still a v1 Checkout Session regardless of the connected account's own API
  version). Recording is shared with the portal's return-page confirmation
  via ``service.record_checkout_payment``, which is idempotent.
- ``/connect-account``: the v2 Core Account event destination, for
  ``v2.core.account.updated`` (onboarding/capability-status changes) — a thin
  event, so the handler fetches the current Account itself rather than
  reading one embedded in the payload.

See ``core/stripe_events.py`` for signature verification + replay protection.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from binx_api.core.config import get_settings
from binx_api.core.dependencies import DbSession
from binx_api.core.stripe_events import verify_and_dedupe, verify_and_dedupe_thin_event
from binx_api.modules.invoicing import service

router = APIRouter(prefix="/webhooks/stripe", tags=["invoicing-webhooks"])
settings = get_settings()


# Both mean "an invoice Checkout Session may now be paid". The second is how
# an async payment method (e.g. a bank debit) reports settling after the
# session itself already completed as "unpaid".
INVOICE_CHECKOUT_EVENTS = ("checkout.session.completed", "checkout.session.async_payment_succeeded")


@router.post("/connect")
async def connect_webhook(request: Request, db: DbSession) -> Response:
    event = await verify_and_dedupe(request, db, settings.stripe_connect_webhook_secret)
    if event is None:
        return Response(status_code=200)

    if event.type in INVOICE_CHECKOUT_EVENTS:
        await service.record_checkout_payment(db, event.data.object)

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

"""Paying the deposit straight after signing.

Accepting a proposal with a deposit issues a deposit invoice (acceptance.py)
a moment after the signature lands. This module tells the signing page where
that deposit stands, and lets the signer pay it there and then, through the
same Stripe Checkout on the agency's own connected account as any invoice
(invoicing/service.py's ``start_invoice_checkout``), so the platform fee, the
idempotent recording and the work starting once it's paid (acceptance's
``on_invoice_paid``) are all the ones invoices already use.

The signer on a share link has no account yet, so the payment is recorded
with no "paid by" user, and the return page confirms it through the share
link rather than the portal.
"""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core.config import get_settings
from binx_api.modules.agencies.models import Agency
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import AgencyBillingSettings, Invoice
from binx_api.modules.invoicing.schemas import CheckoutOutcome
from binx_api.modules.proposals import acceptance
from binx_api.modules.proposals.models import ACCEPTANCE_BLOCKED, STATUS_SIGNED, Proposal
from binx_api.modules.proposals.schemas import ProposalDepositRead

settings = get_settings()

DepositStatus = Literal["awaiting_countersign", "preparing", "unavailable", "due", "paid"]

# Invoice display statuses that can still be paid (as in the client portal).
_PAYABLE = {"sent", "overdue", "partial"}


async def _deposit_invoice(db: AsyncSession, proposal: Proposal) -> tuple[Invoice | None, bool]:
    """The deposit invoice, if issued yet, and whether setting it up stopped
    (a blocked acceptance)."""
    row = await acceptance.get_acceptance(db, proposal.id)
    if row is None:
        return None, False
    invoice = await db.get(Invoice, row.deposit_invoice_id) if row.deposit_invoice_id else None
    return invoice, invoice is None and row.status == ACCEPTANCE_BLOCKED


async def _charges_enabled(db: AsyncSession, agency_id) -> bool:
    enabled = await db.scalar(
        select(AgencyBillingSettings.stripe_connect_charges_enabled).where(AgencyBillingSettings.agency_id == agency_id)
    )
    return bool(enabled)


async def _state(db: AsyncSession, proposal: Proposal) -> tuple[DepositStatus, Invoice | None]:
    if proposal.completed_at is None:
        return "awaiting_countersign", None
    invoice, blocked = await _deposit_invoice(db, proposal)
    if invoice is None:
        return ("unavailable" if blocked else "preparing"), None
    if invoicing_service._display_status(invoice) in _PAYABLE:
        return "due", invoice
    return ("paid" if invoice.amount_paid_cents >= invoice.total_cents else "unavailable"), invoice


async def deposit_read(
    db: AsyncSession, proposal: Proposal, *, with_invoice_id: bool = False
) -> ProposalDepositRead | None:
    """Where the deposit stands, for a signed proposal that asks for one
    (None otherwise, or for a standalone proposal, which has no acceptance).
    ``with_invoice_id`` for reads that can link to the invoice (the portal)."""
    amount = acceptance.deposit_cents(proposal)
    if amount <= 0 or proposal.status != STATUS_SIGNED:
        return None
    if proposal.lead_id is None and proposal.client_id is None:
        return None

    state, invoice = await _state(db, proposal)
    balance = invoice.total_cents - invoice.amount_paid_cents if invoice else amount
    return ProposalDepositRead(
        status=state,
        amount_cents=balance if state == "due" else amount,
        currency=proposal.currency,
        invoice_number=invoice.number if invoice else None,
        invoice_id=invoice.id if invoice and with_invoice_id else None,
        pay_online=state == "due" and await _charges_enabled(db, proposal.agency_id),
    )


async def _payable(db: AsyncSession, proposal: Proposal) -> tuple[Invoice, Agency, AgencyBillingSettings]:
    current = await deposit_read(db, proposal)
    if current is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This proposal has no deposit to pay")
    if current.status != "due":
        message = {
            "paid": "The deposit is already paid",
            "preparing": "Your deposit invoice is still being prepared. Try again in a moment.",
            "awaiting_countersign": "The deposit can be paid once the agency has countersigned",
        }.get(current.status, "The deposit can't be paid online. The agency will be in touch.")
        raise HTTPException(status.HTTP_409_CONFLICT, message)
    if not current.pay_online:
        raise HTTPException(status.HTTP_409_CONFLICT, "Online payment isn't set up for this agency yet")
    invoice, _blocked = await _deposit_invoice(db, proposal)
    agency = await db.get(Agency, proposal.agency_id)
    billing_settings = await invoicing_service.get_or_create_billing_settings(db, agency)
    assert invoice is not None and agency is not None
    return invoice, agency, billing_settings


def _return_url(proposal: Proposal, outcome: str) -> str:
    base = f"{settings.frontend_url}/proposals/public?token={proposal.share_token}&deposit={outcome}"
    # {CHECKOUT_SESSION_ID} is filled in by Stripe on the way back.
    return base + ("&session_id={CHECKOUT_SESSION_ID}" if outcome == "paid" else "")


async def start_checkout(db: AsyncSession, proposal: Proposal) -> str:
    """A Checkout Session for the deposit invoice's balance; returns its URL."""
    invoice, agency, billing_settings = await _payable(db, proposal)
    return await invoicing_service.start_invoice_checkout(
        db,
        invoice,
        agency,
        billing_settings,
        paid_by=None,
        success_url=_return_url(proposal, "paid"),
        cancel_url=_return_url(proposal, "cancelled"),
        extra_metadata={"proposal_id": str(proposal.id)},
    )


async def confirm_checkout(db: AsyncSession, proposal: Proposal, session_id: str) -> CheckoutOutcome:
    """The return page's check with Stripe (records the payment if it's in,
    which starts whatever was waiting on the deposit)."""
    invoice, _blocked = await _deposit_invoice(db, proposal)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "There's no deposit invoice for this proposal")
    agency = await db.get(Agency, proposal.agency_id)
    assert agency is not None
    billing_settings = await invoicing_service.get_or_create_billing_settings(db, agency)
    return await invoicing_service.confirm_checkout_session(db, invoice, agency, billing_settings, session_id)

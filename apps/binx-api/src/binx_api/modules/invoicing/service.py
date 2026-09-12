"""Service layer for client invoicing.

Money is integer cents throughout; the subtotal / discount / tax / total on an
invoice are denormalized and recomputed here (``_recalculate``) on every edit
so the list view and reports never have to. A draft is freely editable; once
issued an invoice is frozen except for recording payments and voiding.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

import stripe
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import stripe_client
from binx_api.core.config import get_settings
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_INVOICING as ACTIVITY_CATEGORY_INVOICING
from binx_api.modules.activity.models import CATEGORY_SETTINGS as ACTIVITY_CATEGORY_SETTINGS
from binx_api.modules.activity.models import VISIBILITY_ADMIN
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency, AgencyClient, AgencyMember
from binx_api.modules.invoicing.models import (
    STATUS_DRAFT,
    STATUS_PAID,
    STATUS_SENT,
    STATUS_VOID,
    AgencyBillingSettings,
    Invoice,
    InvoiceLineItem,
    InvoicePayment,
)
from binx_api.modules.invoicing.schemas import LineItemInput
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_INVOICING, EVENT_INVOICE_ISSUED, EVENT_INVOICE_PAID
from binx_api.modules.projects.models import Project
from binx_api.modules.users.models import User

settings = get_settings()


def _format_money(amount_cents: int, currency: str) -> str:
    return f"{currency} {amount_cents / 100:,.2f}"


# ---- Plan limits --------------------------------------------------------
# Binx has no billing/plans yet — every agency can issue as many invoices as
# it likes. Same shape as projects/service.py's _check_can_create_project:
# once a plan carries an invoice cap, count here and raise
# HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "...") before creating.
async def _check_can_create_invoice(db: AsyncSession, agency: Agency) -> None:
    return None


# ---- Money helpers -----------------------------------------------------


def _round_cents(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _line_amount(quantity: Decimal, unit_price_cents: int) -> int:
    return _round_cents(Decimal(quantity) * Decimal(unit_price_cents))


def _recalculate(invoice: Invoice, line_items: list[InvoiceLineItem]) -> None:
    """Recompute the denormalized totals from the current lines + discount +
    tax. The only place these four columns are ever written."""
    subtotal = sum(item.amount_cents for item in line_items)

    if invoice.discount_amount_cents is not None:
        discount = min(invoice.discount_amount_cents, subtotal)
    elif invoice.discount_percent is not None:
        discount = _round_cents(Decimal(subtotal) * Decimal(invoice.discount_percent) / Decimal(100))
    else:
        discount = 0

    taxable = subtotal - discount
    tax = _round_cents(Decimal(taxable) * Decimal(invoice.tax_rate_percent) / Decimal(100))

    invoice.subtotal_cents = subtotal
    invoice.discount_cents = discount
    invoice.tax_cents = tax
    invoice.total_cents = taxable + tax


def _display_status(invoice: Invoice, today: date | None = None) -> str:
    """The label the UI shows — the stored status, refined with the derived
    ``overdue`` / ``partial`` states."""
    today = today or datetime.now(UTC).date()
    if invoice.status in (STATUS_VOID, STATUS_PAID, STATUS_DRAFT):
        return invoice.status
    # sent:
    due = invoice.total_cents - invoice.amount_paid_cents
    if due > 0 and invoice.due_date < today:
        return "overdue"
    if 0 < invoice.amount_paid_cents < invoice.total_cents:
        return "partial"
    return STATUS_SENT


# ---- Billing settings ------------------------------------------------


async def get_or_create_billing_settings(db: AsyncSession, agency: Agency) -> AgencyBillingSettings:
    result = await db.execute(select(AgencyBillingSettings).where(AgencyBillingSettings.agency_id == agency.id))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = AgencyBillingSettings(agency_id=agency.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


async def update_billing_settings(
    db: AsyncSession, agency: Agency, *, data: dict, actor: User | None = None
) -> AgencyBillingSettings:
    settings = await get_or_create_billing_settings(db, agency)
    for field, value in data.items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=ACTIVITY_CATEGORY_SETTINGS,
        event_type="billing_settings_updated",
        visibility=VISIBILITY_ADMIN,
        summary=f"{actor.full_name} updated the billing settings" if actor else "Billing settings updated",
        actor=actor,
    )
    return settings


# ---- Stripe Connect (client-invoice payments) -------------------------
# Money settles directly into the agency's own Stripe account ("direct
# charge" pattern) rather than pooling in Binx's — see
# client_portal/router.py::pay_invoice and invoicing/webhooks_router.py.


async def start_connect_onboarding(db: AsyncSession, agency: Agency, *, country: str = "US") -> str:
    """Get-or-create the agency's Express account, then always mint a fresh
    Account Link — they expire in minutes, so a stored URL is never reusable
    and "Continue onboarding" must call this again."""
    if not settings.stripe_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stripe isn't configured")
    billing_settings = await get_or_create_billing_settings(db, agency)
    if billing_settings.stripe_connect_account_id is None:
        account = await stripe_client.create_connect_account(
            {
                "type": "express",
                "country": country,
                "email": billing_settings.contact_email,
                "capabilities": {
                    "card_payments": {"requested": True},
                    "transfers": {"requested": True},
                },
            }
        )
        billing_settings.stripe_connect_account_id = account.id
        await db.commit()
        await db.refresh(billing_settings)

    link = await stripe_client.create_account_link(
        {
            "account": billing_settings.stripe_connect_account_id,
            "type": "account_onboarding",
            "refresh_url": f"{settings.frontend_url}/settings/invoicing?stripe=refresh",
            "return_url": f"{settings.frontend_url}/settings/invoicing?stripe=return",
        }
    )
    return link.url


async def sync_connect_status(db: AsyncSession, account: stripe.Account) -> AgencyBillingSettings | None:
    """Applied from the Connect webhook's ``account.updated`` event. Returns
    ``None`` if the account id isn't recognised (shouldn't happen outside a
    misconfigured webhook, but a webhook handler must never 500 on an
    unexpected payload)."""
    result = await db.execute(
        select(AgencyBillingSettings).where(AgencyBillingSettings.stripe_connect_account_id == account.id)
    )
    billing_settings = result.scalar_one_or_none()
    if billing_settings is None:
        return None

    billing_settings.stripe_connect_charges_enabled = bool(account.charges_enabled)
    billing_settings.stripe_connect_details_submitted = bool(account.details_submitted)
    billing_settings.stripe_connect_payouts_enabled = bool(account.payouts_enabled)
    if billing_settings.stripe_connect_charges_enabled and billing_settings.stripe_connect_onboarded_at is None:
        billing_settings.stripe_connect_onboarded_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(billing_settings)
    return billing_settings


async def get_connect_status(db: AsyncSession, agency: Agency, *, refresh: bool = False) -> AgencyBillingSettings:
    """A plain local read, unless ``refresh`` is set and the row still looks
    pending — then one live lookup closes the race between the onboarding
    redirect landing back and the ``account.updated`` webhook arriving."""
    billing_settings = await get_or_create_billing_settings(db, agency)
    if refresh and billing_settings.stripe_connect_account_id and not billing_settings.stripe_connect_charges_enabled:
        account = await stripe_client.retrieve_connect_account(billing_settings.stripe_connect_account_id)
        updated = await sync_connect_status(db, account)
        if updated is not None:
            return updated
    return billing_settings


async def start_invoice_checkout(
    db: AsyncSession, invoice: Invoice, agency: Agency, billing_settings: AgencyBillingSettings, *, paid_by: User
) -> str:
    """A Checkout Session created *on the connected account* — the agency is
    the merchant of record. Always for the full outstanding balance; no
    partial-payment concept exists anywhere in this system. ``paid_by`` is
    threaded through as metadata so the webhook can attribute the resulting
    ``InvoicePayment`` to the contact who actually paid, the same way the
    (now-removed) synchronous stub did."""
    balance = invoice.total_cents - invoice.amount_paid_cents
    fee_cents = round(balance * settings.stripe_application_fee_bps / 10_000)

    params: dict = {
        "mode": "payment",
        "line_items": [
            {
                "quantity": 1,
                "price_data": {
                    "currency": invoice.currency.lower(),
                    "unit_amount": balance,
                    "product_data": {"name": f"Invoice {invoice.number}"},
                },
            }
        ],
        "metadata": {
            "invoice_id": str(invoice.id),
            "agency_id": str(agency.id),
            "paid_by_user_id": str(paid_by.id),
        },
        "success_url": f"{settings.frontend_url}/portal/invoices/{invoice.id}?checkout=success",
        "cancel_url": f"{settings.frontend_url}/portal/invoices/{invoice.id}?checkout=cancel",
    }
    if fee_cents:
        params["payment_intent_data"] = {"application_fee_amount": fee_cents}

    session = await stripe_client.create_checkout_session(
        params, stripe_account=billing_settings.stripe_connect_account_id
    )
    return session.url


async def _next_invoice_number(db: AsyncSession, agency: Agency) -> str:
    """Allocate the next per-agency invoice number under a row lock so two
    concurrent creations can't collide on it."""
    await get_or_create_billing_settings(db, agency)  # ensure the row exists to lock
    result = await db.execute(
        select(AgencyBillingSettings).where(AgencyBillingSettings.agency_id == agency.id).with_for_update()
    )
    settings = result.scalar_one()
    number = f"{settings.invoice_prefix}{settings.next_invoice_number:0{settings.number_padding}d}"
    settings.next_invoice_number += 1
    return number


# ---- Guards ---------------------------------------------------------


async def _require_agency_member(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(AgencyMember.id).where(AgencyMember.agency_id == agency_id, AgencyMember.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only agency members can be assigned to an invoice")


async def get_invoice_or_404(db: AsyncSession, agency_id: uuid.UUID, invoice_id: uuid.UUID) -> Invoice:
    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.agency_id == agency_id))
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return invoice


def _require_draft(invoice: Invoice) -> None:
    if invoice.status != STATUS_DRAFT:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Only draft invoices can be edited — void this one and start a new one"
        )


# ---- Line items ----------------------------------------------------


async def _list_line_items(db: AsyncSession, invoice_id: uuid.UUID) -> list[InvoiceLineItem]:
    result = await db.execute(
        select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id).order_by(InvoiceLineItem.position)
    )
    return list(result.scalars().all())


async def _replace_line_items(
    db: AsyncSession, invoice: Invoice, line_items: list[LineItemInput]
) -> list[InvoiceLineItem]:
    await db.execute(InvoiceLineItem.__table__.delete().where(InvoiceLineItem.invoice_id == invoice.id))
    rows: list[InvoiceLineItem] = []
    for position, item in enumerate(line_items):
        row = InvoiceLineItem(
            invoice_id=invoice.id,
            position=position,
            description=item.description,
            quantity=item.quantity,
            unit_price_cents=item.unit_price_cents,
            amount_cents=_line_amount(item.quantity, item.unit_price_cents),
        )
        db.add(row)
        rows.append(row)
    return rows


# ---- Create / read / update ---------------------------------------


async def create_invoice(
    db: AsyncSession,
    agency: Agency,
    *,
    created_by: User,
    client_id: uuid.UUID,
    project_id: uuid.UUID | None,
    issue_date: date | None,
    due_date: date | None,
    discount_amount_cents: int | None,
    discount_percent: Decimal | None,
    tax_rate_percent: Decimal,
    notes: str | None,
    payment_instructions: str | None,
    line_items: list[LineItemInput],
) -> Invoice:
    await _check_can_create_invoice(db, agency)
    await agencies_service.get_client_or_404(db, agency.id, client_id)
    if project_id is not None:
        result = await db.execute(select(Project.id).where(Project.id == project_id, Project.agency_id == agency.id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    settings = await get_or_create_billing_settings(db, agency)
    issue = issue_date or datetime.now(UTC).date()
    due = due_date or issue + timedelta(days=settings.default_due_days)
    number = await _next_invoice_number(db, agency)

    invoice = Invoice(
        agency_id=agency.id,
        client_id=client_id,
        project_id=project_id,
        number=number,
        status=STATUS_DRAFT,
        currency=settings.currency,
        issue_date=issue,
        due_date=due,
        discount_amount_cents=discount_amount_cents,
        discount_percent=discount_percent,
        tax_rate_percent=tax_rate_percent,
        notes=notes if notes is not None else settings.default_notes,
        payment_instructions=(
            payment_instructions if payment_instructions is not None else settings.payment_instructions
        ),
        created_by_id=created_by.id,
    )
    db.add(invoice)
    await db.flush()

    rows = await _replace_line_items(db, invoice, line_items)
    _recalculate(invoice, rows)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not create invoice, please try again") from None

    await db.refresh(invoice)

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=ACTIVITY_CATEGORY_INVOICING,
        event_type="invoice_created",
        summary=f"{created_by.full_name} drafted invoice {invoice.number}",
        actor=created_by,
        target_type="invoice",
        target_id=invoice.id,
        target_name=invoice.number,
    )
    return invoice


async def update_invoice(
    db: AsyncSession,
    invoice: Invoice,
    *,
    client_id: uuid.UUID,
    project_id: uuid.UUID | None,
    issue_date: date | None,
    due_date: date | None,
    discount_amount_cents: int | None,
    discount_percent: Decimal | None,
    tax_rate_percent: Decimal,
    notes: str | None,
    payment_instructions: str | None,
    line_items: list[LineItemInput],
) -> Invoice:
    _require_draft(invoice)
    await agencies_service.get_client_or_404(db, invoice.agency_id, client_id)
    if project_id is not None:
        result = await db.execute(
            select(Project.id).where(Project.id == project_id, Project.agency_id == invoice.agency_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    invoice.client_id = client_id
    invoice.project_id = project_id
    if issue_date is not None:
        invoice.issue_date = issue_date
    if due_date is not None:
        invoice.due_date = due_date
    invoice.discount_amount_cents = discount_amount_cents
    invoice.discount_percent = discount_percent
    invoice.tax_rate_percent = tax_rate_percent
    invoice.notes = notes
    invoice.payment_instructions = payment_instructions

    rows = await _replace_line_items(db, invoice, line_items)
    _recalculate(invoice, rows)
    await db.commit()
    await db.refresh(invoice)
    return invoice


async def list_invoices(
    db: AsyncSession,
    agency_id: uuid.UUID,
    *,
    status_filter: str | None = None,
    client_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> list[tuple[Invoice, str, str | None]]:
    query = (
        select(Invoice, AgencyClient.name, Project.name)
        .join(AgencyClient, AgencyClient.id == Invoice.client_id)
        .outerjoin(Project, Project.id == Invoice.project_id)
        .where(Invoice.agency_id == agency_id)
    )
    if client_id is not None:
        query = query.where(Invoice.client_id == client_id)
    if project_id is not None:
        query = query.where(Invoice.project_id == project_id)
    query = query.order_by(Invoice.issue_date.desc(), Invoice.created_at.desc())

    rows = (await db.execute(query)).all()
    today = datetime.now(UTC).date()
    if status_filter:
        rows = [r for r in rows if _display_status(r[0], today) == status_filter]
    return [(invoice, client_name, project_name) for invoice, client_name, project_name in rows]


async def get_invoice_context(
    db: AsyncSession, invoice: Invoice
) -> tuple[
    Agency,
    AgencyClient,
    str | None,
    AgencyBillingSettings,
    list[InvoiceLineItem],
    list[tuple[InvoicePayment, str | None]],
]:
    client = await db.get(AgencyClient, invoice.client_id)
    assert client is not None  # FK guarantees it
    project_name = None
    if invoice.project_id is not None:
        project = await db.get(Project, invoice.project_id)
        project_name = project.name if project else None

    agency = await db.get(Agency, invoice.agency_id)
    assert agency is not None
    settings = await get_or_create_billing_settings(db, agency)
    line_items = await _list_line_items(db, invoice.id)
    payments = await list_payments(db, invoice.id)
    return agency, client, project_name, settings, line_items, payments


# ---- Issue / void / delete --------------------------------------


async def issue_invoice(db: AsyncSession, invoice: Invoice, *, issued_by: User) -> Invoice:
    if invoice.status == STATUS_SENT or invoice.status == STATUS_PAID:
        return invoice
    if invoice.status == STATUS_VOID:
        raise HTTPException(status.HTTP_409_CONFLICT, "This invoice was voided")
    if (await _line_count(db, invoice.id)) == 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Add at least one line item before issuing")

    invoice.status = STATUS_SENT
    invoice.issued_at = datetime.now(UTC)
    invoice.issued_by_id = issued_by.id
    await _apply_payments(db, invoice)  # a draft could already carry payments
    await db.commit()
    await db.refresh(invoice)

    # Tell the person who drafted it that it's gone out, if that wasn't them.
    if invoice.created_by_id is not None:
        await notifications_service.notify(
            db,
            user_id=invoice.created_by_id,
            category=CATEGORY_INVOICING,
            event_type=EVENT_INVOICE_ISSUED,
            title=f"Invoice {invoice.number} was issued",
            body=f"{issued_by.full_name} issued it for {_format_money(invoice.total_cents, invoice.currency)}.",
            link=f"/invoices/{invoice.id}",
            agency_id=invoice.agency_id,
            actor=issued_by,
        )
    total = _format_money(invoice.total_cents, invoice.currency)
    await activity_service.log_agency_activity(
        db,
        invoice.agency_id,
        category=ACTIVITY_CATEGORY_INVOICING,
        event_type="invoice_issued",
        summary=f"{issued_by.full_name} issued invoice {invoice.number} for {total}",
        actor=issued_by,
        target_type="invoice",
        target_id=invoice.id,
        target_name=invoice.number,
    )
    return invoice


async def _line_count(db: AsyncSession, invoice_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count()).select_from(InvoiceLineItem).where(InvoiceLineItem.invoice_id == invoice_id)
    )
    return result.scalar_one()


async def void_invoice(db: AsyncSession, invoice: Invoice, *, voided_by: User) -> Invoice:
    if invoice.status == STATUS_VOID:
        return invoice
    invoice.status = STATUS_VOID
    invoice.voided_at = datetime.now(UTC)
    invoice.voided_by_id = voided_by.id
    await db.commit()
    await db.refresh(invoice)

    await activity_service.log_agency_activity(
        db,
        invoice.agency_id,
        category=ACTIVITY_CATEGORY_INVOICING,
        event_type="invoice_voided",
        summary=f"{voided_by.full_name} voided invoice {invoice.number}",
        actor=voided_by,
        target_type="invoice",
        target_id=invoice.id,
        target_name=invoice.number,
    )
    return invoice


async def delete_invoice(db: AsyncSession, invoice: Invoice, *, actor: User | None = None) -> None:
    if invoice.status != STATUS_DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only draft invoices can be deleted — void an issued one instead")
    agency_id = invoice.agency_id
    number = invoice.number
    await db.delete(invoice)
    await db.commit()

    await activity_service.log_agency_activity(
        db,
        agency_id,
        category=ACTIVITY_CATEGORY_INVOICING,
        event_type="invoice_deleted",
        summary=(
            f"{actor.full_name} deleted the draft invoice {number}"
            if actor
            else f"The draft invoice {number} was deleted"
        ),
        actor=actor,
        target_type="invoice",
        target_name=number,
    )


# ---- Payments ---------------------------------------------------


async def list_payments(db: AsyncSession, invoice_id: uuid.UUID) -> list[tuple[InvoicePayment, str | None]]:
    result = await db.execute(
        select(InvoicePayment, User.full_name)
        .outerjoin(User, User.id == InvoicePayment.recorded_by_id)
        .where(InvoicePayment.invoice_id == invoice_id)
        .order_by(InvoicePayment.paid_on, InvoicePayment.created_at)
    )
    return [(payment, name) for payment, name in result.all()]


async def _apply_payments(db: AsyncSession, invoice: Invoice) -> None:
    """Recompute amount_paid_cents and flip status sent <-> paid accordingly.
    Never touches a draft or a voided invoice's status."""
    total_paid = (
        await db.execute(
            select(func.coalesce(func.sum(InvoicePayment.amount_cents), 0)).where(
                InvoicePayment.invoice_id == invoice.id
            )
        )
    ).scalar_one()
    invoice.amount_paid_cents = int(total_paid)

    if invoice.status == STATUS_PAID and invoice.amount_paid_cents < invoice.total_cents:
        invoice.status = STATUS_SENT
    elif invoice.status == STATUS_SENT and invoice.amount_paid_cents >= invoice.total_cents:
        invoice.status = STATUS_PAID


async def add_payment(
    db: AsyncSession,
    invoice: Invoice,
    *,
    recorded_by: User | None,
    amount_cents: int,
    paid_on: date,
    method: str,
    reference: str | None,
    stripe_payment_intent_id: str | None = None,
    stripe_checkout_session_id: str | None = None,
) -> InvoicePayment:
    """``recorded_by`` is only ``None`` for a Stripe-webhook-driven payment
    where the paying user couldn't be resolved from the Checkout session's
    metadata (e.g. their account was since deleted) — every other caller
    (staff manual entry, the portal-checkout webhook's normal path) passes a
    real user."""
    if invoice.status == STATUS_VOID:
        raise HTTPException(status.HTTP_409_CONFLICT, "This invoice was voided")
    payment = InvoicePayment(
        invoice_id=invoice.id,
        recorded_by_id=recorded_by.id if recorded_by else None,
        amount_cents=amount_cents,
        paid_on=paid_on,
        method=method,
        reference=reference,
        stripe_payment_intent_id=stripe_payment_intent_id,
        stripe_checkout_session_id=stripe_checkout_session_id,
    )
    db.add(payment)
    await db.flush()
    await _apply_payments(db, invoice)
    await db.commit()
    await db.refresh(payment)
    await db.refresh(invoice)

    # Notify the people who own this invoice (drafter + issuer) that money came in.
    stakeholders = {uid for uid in (invoice.created_by_id, invoice.issued_by_id) if uid is not None}
    fully_paid = invoice.status == STATUS_PAID
    # method "portal" (historical stub) / "stripe" (real Connect payment) both
    # mean the client paid it themselves through /portal — the copy reads as
    # an event ("X paid"), not a staff bookkeeping entry.
    via_portal = method in ("portal", "stripe")
    money = _format_money(amount_cents, invoice.currency)
    payer_name = recorded_by.full_name if recorded_by else "The client"
    await notifications_service.notify_many(
        db,
        user_ids=stakeholders,
        category=CATEGORY_INVOICING,
        event_type=EVENT_INVOICE_PAID,
        title=(
            f"Invoice {invoice.number} is paid in full"
            if fully_paid
            else f"Payment recorded for invoice {invoice.number}"
        ),
        body=(
            f"{payer_name} paid {money} through the client portal."
            if via_portal
            else f"{payer_name} recorded {money}."
        ),
        link=f"/invoices/{invoice.id}",
        agency_id=invoice.agency_id,
        actor=recorded_by,
    )
    await activity_service.log_agency_activity(
        db,
        invoice.agency_id,
        category=ACTIVITY_CATEGORY_INVOICING,
        event_type="invoice_paid_portal" if via_portal else "payment_recorded",
        summary=(
            (
                f"{payer_name} paid {money} on invoice {invoice.number} via the client portal"
                if via_portal
                else f"{payer_name} recorded a {money} payment on invoice {invoice.number}"
            )
            + (" — paid in full" if fully_paid else "")
        ),
        actor=recorded_by,
        target_type="invoice",
        target_id=invoice.id,
        target_name=invoice.number,
    )
    return payment


async def get_payment_or_404(db: AsyncSession, invoice_id: uuid.UUID, payment_id: uuid.UUID) -> InvoicePayment:
    result = await db.execute(
        select(InvoicePayment).where(InvoicePayment.id == payment_id, InvoicePayment.invoice_id == invoice_id)
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    return payment


async def delete_payment(
    db: AsyncSession, invoice: Invoice, payment: InvoicePayment, *, actor: User | None = None
) -> None:
    amount = payment.amount_cents
    await db.delete(payment)
    await db.flush()
    await _apply_payments(db, invoice)
    await db.commit()

    await activity_service.log_agency_activity(
        db,
        invoice.agency_id,
        category=ACTIVITY_CATEGORY_INVOICING,
        event_type="payment_deleted",
        summary=(
            f"{actor.full_name} removed a {_format_money(amount, invoice.currency)} payment "
            f"from invoice {invoice.number}"
            if actor
            else f"A {_format_money(amount, invoice.currency)} payment was removed from invoice {invoice.number}"
        ),
        actor=actor,
        target_type="invoice",
        target_id=invoice.id,
        target_name=invoice.number,
    )


# ---- Summary --------------------------------------------------


async def agency_invoice_summary(db: AsyncSession, agency_id: uuid.UUID, *, client_id: uuid.UUID | None = None) -> dict:
    inv_query = select(Invoice).where(Invoice.agency_id == agency_id, Invoice.status != STATUS_VOID)
    if client_id is not None:
        inv_query = inv_query.where(Invoice.client_id == client_id)
    invoices = list((await db.execute(inv_query)).scalars().all())

    today = datetime.now(UTC).date()
    this_year = today.year

    issued = [inv for inv in invoices if inv.status in (STATUS_SENT, STATUS_PAID)]
    lifetime_billed = sum(inv.total_cents for inv in issued)
    average_invoice = round(lifetime_billed / len(issued)) if issued else 0

    outstanding = sum(
        inv.total_cents - inv.amount_paid_cents for inv in issued if inv.total_cents > inv.amount_paid_cents
    )
    overdue = sum(
        inv.total_cents - inv.amount_paid_cents
        for inv in issued
        if inv.total_cents > inv.amount_paid_cents and inv.due_date < today
    )
    overdue_count = sum(1 for inv in issued if inv.total_cents > inv.amount_paid_cents and inv.due_date < today)
    open_count = sum(1 for inv in issued if inv.total_cents > inv.amount_paid_cents)
    draft_count = sum(1 for inv in invoices if inv.status == STATUS_DRAFT)

    # Money collected — from payment dates, across this agency's (non-void) invoices.
    invoice_ids = [inv.id for inv in invoices]
    monthly: dict[str, int] = {}
    keys: list[tuple[str, str]] = []
    for offset in range(11, -1, -1):
        month = (today.month - offset - 1) % 12 + 1
        year = today.year + (today.month - offset - 1) // 12
        key = f"{year}-{month:02d}"
        label = date(2000, month, 1).strftime("%b")
        keys.append((key, label))
        monthly[key] = 0

    paid_this_year = 0
    if invoice_ids:
        payment_rows = (
            await db.execute(
                select(InvoicePayment.amount_cents, InvoicePayment.paid_on).where(
                    InvoicePayment.invoice_id.in_(invoice_ids)
                )
            )
        ).all()
        for amount, paid_on in payment_rows:
            if paid_on.year == this_year:
                paid_this_year += amount
            bucket = f"{paid_on.year}-{paid_on.month:02d}"
            if bucket in monthly:
                monthly[bucket] += amount

    return {
        "outstanding_cents": outstanding,
        "overdue_cents": overdue,
        "paid_this_year_cents": paid_this_year,
        "lifetime_billed_cents": lifetime_billed,
        "average_invoice_cents": average_invoice,
        "draft_count": draft_count,
        "open_count": open_count,
        "overdue_count": overdue_count,
        "monthly_paid": [{"label": label, "value": round(monthly[key] / 100)} for key, label in keys],
    }

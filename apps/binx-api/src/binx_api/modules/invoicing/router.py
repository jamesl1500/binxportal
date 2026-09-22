import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.core.email import send_invoice_issued_email
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency, AgencyClient
from binx_api.modules.ai import service as ai_service
from binx_api.modules.ai.schemas import AiDraftRead
from binx_api.modules.invoicing import service
from binx_api.modules.invoicing.models import Invoice, InvoiceLineItem, InvoicePayment
from binx_api.modules.invoicing.schemas import (
    BillingSettingsRead,
    BillingSettingsUpdate,
    InvoiceCreate,
    InvoiceDetailRead,
    InvoiceFromTimeEntriesCreate,
    InvoiceParty,
    InvoiceRead,
    InvoiceSummaryRead,
    InvoiceUpdate,
    IssueInvoiceRequest,
    LineItemRead,
    PaymentCreate,
    PaymentRead,
    StripeConnectStatusRead,
    StripeOnboardingLinkRead,
)
from binx_api.modules.time_tracking import service as time_tracking_service

router = APIRouter(prefix="/agencies/{agency_id}", tags=["invoicing"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
AgencyAndRole = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


def _money(cents: int, currency: str) -> str:
    return f"{cents / 100:,.2f} {currency}"


def _invoice_read(invoice: Invoice, client_name: str, project_name: str | None) -> InvoiceRead:
    return InvoiceRead(
        id=invoice.id,
        agency_id=invoice.agency_id,
        client_id=invoice.client_id,
        client_name=client_name,
        project_id=invoice.project_id,
        project_name=project_name,
        number=invoice.number,
        status=invoice.status,
        display_status=service._display_status(invoice),
        currency=invoice.currency,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        subtotal_cents=invoice.subtotal_cents,
        discount_cents=invoice.discount_cents,
        tax_cents=invoice.tax_cents,
        total_cents=invoice.total_cents,
        amount_paid_cents=invoice.amount_paid_cents,
        amount_due_cents=invoice.total_cents - invoice.amount_paid_cents,
        created_at=invoice.created_at,
    )


def _line_item_read(item: InvoiceLineItem) -> LineItemRead:
    return LineItemRead(
        id=item.id,
        position=item.position,
        description=item.description,
        quantity=item.quantity,
        unit_price_cents=item.unit_price_cents,
        amount_cents=item.amount_cents,
    )


def _payment_read(payment: InvoicePayment, recorded_by_name: str | None) -> PaymentRead:
    return PaymentRead(
        id=payment.id,
        invoice_id=payment.invoice_id,
        amount_cents=payment.amount_cents,
        paid_on=payment.paid_on,
        method=payment.method,
        reference=payment.reference,
        recorded_by_name=recorded_by_name,
        created_at=payment.created_at,
    )


def _detail_read(
    invoice: Invoice,
    agency: Agency,
    client: AgencyClient,
    project_name: str | None,
    settings,
    line_items: list[InvoiceLineItem],
    payments: list[tuple[InvoicePayment, str | None]],
) -> InvoiceDetailRead:
    base = _invoice_read(invoice, client.name, project_name)
    return InvoiceDetailRead(
        **base.model_dump(),
        discount_amount_cents=invoice.discount_amount_cents,
        discount_percent=invoice.discount_percent,
        tax_rate_percent=invoice.tax_rate_percent,
        notes=invoice.notes,
        payment_instructions=invoice.payment_instructions,
        issued_at=invoice.issued_at,
        voided_at=invoice.voided_at,
        from_=InvoiceParty(
            # Fall back to the agency's name until billing settings are filled in.
            name=settings.legal_name or agency.name,
            address=settings.address,
            email=settings.contact_email,
            tax_id=settings.tax_id,
        ),
        bill_to=InvoiceParty(
            name=client.name,
            address=client.billing_address,
            email=client.billing_email or client.primary_contact_email,
        ),
        line_items=[_line_item_read(item) for item in line_items],
        payments=[_payment_read(payment, name) for payment, name in payments],
    )


# ---- Billing settings ---------------------------------------------


@router.get("/billing-settings", response_model=BillingSettingsRead)
async def read_billing_settings(db: DbSession, agency_and_role: AnyMember) -> BillingSettingsRead:
    agency, _role = agency_and_role
    settings = await service.get_or_create_billing_settings(db, agency)
    return BillingSettingsRead.model_validate(settings, from_attributes=True)


@router.patch("/billing-settings", response_model=BillingSettingsRead)
async def write_billing_settings(
    db: DbSession, current_user: CurrentUser, agency_and_role: AgencyAndRole, data: BillingSettingsUpdate
) -> BillingSettingsRead:
    agency, _role = agency_and_role
    settings = await service.update_billing_settings(db, agency, data=data.model_dump(), actor=current_user)
    return BillingSettingsRead.model_validate(settings, from_attributes=True)


# ---- Stripe Connect ------------------------------------------------


@router.get("/billing-settings/stripe/status", response_model=StripeConnectStatusRead)
async def read_stripe_connect_status(
    db: DbSession, agency_and_role: AnyMember, stripe: str | None = Query(default=None)
) -> StripeConnectStatusRead:
    """``?stripe=return`` (set by the onboarding return_url) triggers one live
    reconciliation call if the row still looks pending — closes the race
    between the redirect landing back and the v2.core.account.updated event
    destination's webhook."""
    agency, _role = agency_and_role
    settings_row = await service.get_connect_status(db, agency, refresh=(stripe == "return"))
    return StripeConnectStatusRead(
        connected=settings_row.stripe_connect_account_id is not None,
        charges_enabled=settings_row.stripe_connect_charges_enabled,
        details_submitted=settings_row.stripe_connect_details_submitted,
        payouts_enabled=settings_row.stripe_connect_payouts_enabled,
        onboarded_at=settings_row.stripe_connect_onboarded_at,
    )


@router.post("/billing-settings/stripe/connect", response_model=StripeOnboardingLinkRead)
async def start_stripe_connect_onboarding(db: DbSession, agency_and_role: AgencyAndRole) -> StripeOnboardingLinkRead:
    agency, _role = agency_and_role
    url = await service.start_connect_onboarding(db, agency)
    return StripeOnboardingLinkRead(onboarding_url=url)


# ---- Invoices ---------------------------------------------------


@router.get("/invoices", response_model=list[InvoiceRead])
async def list_invoices(
    db: DbSession,
    agency_and_role: AnyMember,
    status_filter: str | None = Query(default=None, alias="status"),
    client_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> list[InvoiceRead]:
    agency, _role = agency_and_role
    rows = await service.list_invoices(
        db, agency.id, status_filter=status_filter, client_id=client_id, project_id=project_id
    )
    return [_invoice_read(invoice, client_name, project_name) for invoice, client_name, project_name in rows]


@router.get("/invoices/summary", response_model=InvoiceSummaryRead)
async def invoice_summary(
    db: DbSession, agency_and_role: AnyMember, client_id: uuid.UUID | None = None
) -> InvoiceSummaryRead:
    agency, _role = agency_and_role
    return InvoiceSummaryRead.model_validate(await service.agency_invoice_summary(db, agency.id, client_id=client_id))


@router.post("/invoices", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: InvoiceCreate
) -> InvoiceDetailRead:
    agency, _role = agency_and_role
    invoice = await service.create_invoice(
        db,
        agency,
        created_by=current_user,
        client_id=data.client_id,
        project_id=data.project_id,
        issue_date=data.issue_date,
        due_date=data.due_date,
        discount_amount_cents=data.discount_amount_cents,
        discount_percent=data.discount_percent,
        tax_rate_percent=data.tax_rate_percent,
        notes=data.notes,
        payment_instructions=data.payment_instructions,
        line_items=data.line_items,
    )
    return _detail_read(invoice, *(await service.get_invoice_context(db, invoice)))


@router.post("/invoices/from-time-entries", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
async def create_invoice_from_time_entries(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: InvoiceFromTimeEntriesCreate
) -> InvoiceDetailRead:
    agency, _role = agency_and_role
    invoice = await time_tracking_service.create_invoice_from_entries(
        db,
        agency,
        created_by=current_user,
        client_id=data.client_id,
        project_id=data.project_id,
        entry_ids=data.entry_ids,
    )
    return _detail_read(invoice, *(await service.get_invoice_context(db, invoice)))


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailRead)
async def read_invoice(db: DbSession, agency_and_role: AnyMember, invoice_id: uuid.UUID) -> InvoiceDetailRead:
    agency, _role = agency_and_role
    invoice = await service.get_invoice_or_404(db, agency.id, invoice_id)
    return _detail_read(invoice, *(await service.get_invoice_context(db, invoice)))


@router.patch("/invoices/{invoice_id}", response_model=InvoiceDetailRead)
async def update_invoice(
    db: DbSession, agency_and_role: AnyMember, invoice_id: uuid.UUID, data: InvoiceUpdate
) -> InvoiceDetailRead:
    agency, _role = agency_and_role
    invoice = await service.get_invoice_or_404(db, agency.id, invoice_id)
    invoice = await service.update_invoice(
        db,
        invoice,
        client_id=data.client_id,
        project_id=data.project_id,
        issue_date=data.issue_date,
        due_date=data.due_date,
        discount_amount_cents=data.discount_amount_cents,
        discount_percent=data.discount_percent,
        tax_rate_percent=data.tax_rate_percent,
        notes=data.notes,
        payment_instructions=data.payment_instructions,
        line_items=data.line_items,
    )
    return _detail_read(invoice, *(await service.get_invoice_context(db, invoice)))


@router.post("/invoices/{invoice_id}/issue", response_model=InvoiceDetailRead)
async def issue_invoice(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AgencyAndRole,
    invoice_id: uuid.UUID,
    data: IssueInvoiceRequest,
) -> InvoiceDetailRead:
    agency, _role = agency_and_role
    invoice = await service.get_invoice_or_404(db, agency.id, invoice_id)
    invoice = await service.issue_invoice(db, invoice, issued_by=current_user)

    if data.send_notice:
        client = await db.get(AgencyClient, invoice.client_id)
        assert client is not None
        recipient = client.billing_email or client.primary_contact_email
        if recipient:
            await send_invoice_issued_email(
                to=recipient,
                agency_name=agency.name,
                invoice_number=invoice.number,
                amount_due=_money(invoice.total_cents - invoice.amount_paid_cents, invoice.currency),
                due_date=invoice.due_date.isoformat(),
            )
    return _detail_read(invoice, *(await service.get_invoice_context(db, invoice)))


@router.post("/invoices/{invoice_id}/void", response_model=InvoiceDetailRead)
async def void_invoice(
    db: DbSession, current_user: CurrentUser, agency_and_role: AgencyAndRole, invoice_id: uuid.UUID
) -> InvoiceDetailRead:
    agency, _role = agency_and_role
    invoice = await service.get_invoice_or_404(db, agency.id, invoice_id)
    invoice = await service.void_invoice(db, invoice, voided_by=current_user)
    return _detail_read(invoice, *(await service.get_invoice_context(db, invoice)))


@router.delete("/invoices/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(
    db: DbSession, current_user: CurrentUser, agency_and_role: AgencyAndRole, invoice_id: uuid.UUID
) -> None:
    agency, _role = agency_and_role
    invoice = await service.get_invoice_or_404(db, agency.id, invoice_id)
    await service.delete_invoice(db, invoice, actor=current_user)


@router.post("/invoices/{invoice_id}/ai/reminder", response_model=AiDraftRead)
async def generate_invoice_ai_reminder(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, invoice_id: uuid.UUID
) -> AiDraftRead:
    agency, _role = agency_and_role
    invoice = await service.get_invoice_or_404(db, agency.id, invoice_id)
    draft = await ai_service.generate_invoice_reminder(db, invoice, agency, actor=current_user)
    return AiDraftRead(draft=draft)


# ---- Payments --------------------------------------------------


@router.get("/invoices/{invoice_id}/payments", response_model=list[PaymentRead])
async def list_payments(db: DbSession, agency_and_role: AnyMember, invoice_id: uuid.UUID) -> list[PaymentRead]:
    agency, _role = agency_and_role
    await service.get_invoice_or_404(db, agency.id, invoice_id)
    rows = await service.list_payments(db, invoice_id)
    return [_payment_read(payment, name) for payment, name in rows]


@router.post("/invoices/{invoice_id}/payments", response_model=InvoiceDetailRead, status_code=status.HTTP_201_CREATED)
async def add_payment(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    invoice_id: uuid.UUID,
    data: PaymentCreate,
) -> InvoiceDetailRead:
    agency, _role = agency_and_role
    invoice = await service.get_invoice_or_404(db, agency.id, invoice_id)
    await service.add_payment(
        db,
        invoice,
        recorded_by=current_user,
        amount_cents=data.amount_cents,
        paid_on=data.paid_on,
        method=data.method,
        reference=data.reference,
    )
    await db.refresh(invoice)
    return _detail_read(invoice, *(await service.get_invoice_context(db, invoice)))


@router.delete("/invoices/{invoice_id}/payments/{payment_id}", response_model=InvoiceDetailRead)
async def delete_payment(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    invoice_id: uuid.UUID,
    payment_id: uuid.UUID,
) -> InvoiceDetailRead:
    agency, _role = agency_and_role
    invoice = await service.get_invoice_or_404(db, agency.id, invoice_id)
    payment = await service.get_payment_or_404(db, invoice_id, payment_id)
    await service.delete_payment(db, invoice, payment, actor=current_user)
    await db.refresh(invoice)
    return _detail_read(invoice, *(await service.get_invoice_context(db, invoice)))

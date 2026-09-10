import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Invoice lifecycle. `overdue` and `partial` are *derived* at read time from
# due_date + amount_paid_cents — they are never stored.
STATUS_DRAFT = "draft"
STATUS_SENT = "sent"
STATUS_PAID = "paid"
STATUS_VOID = "void"

invoice_statuses: list[str] = [STATUS_DRAFT, STATUS_SENT, STATUS_PAID, STATUS_VOID]

# How a recorded payment reached the agency. "portal" is a payment the client
# made themselves through /portal (a demo/stub flow today — see
# client_portal/router.py); the rest are entered by a team member.
PAYMENT_METHODS: list[str] = ["bank_transfer", "check", "card", "cash", "other", "portal"]


# One row per agency, created lazily on first access (same pattern as
# users/models.py's UserNotificationSettings). Holds the "from" block that
# every invoice renders, the currency, the numbering scheme, and the defaults
# a new invoice is seeded with.
class AgencyBillingSettings(Base):
    __tablename__ = "agency_billing_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), unique=True, index=True)

    # The invoice "from" block — all nullable so billing can be filled in later.
    legal_name: Mapped[str | None] = mapped_column(String(255), default=None)
    address: Mapped[str | None] = mapped_column(String(2048), default=None)
    tax_id: Mapped[str | None] = mapped_column(String(64), default=None)
    contact_email: Mapped[str | None] = mapped_column(String(255), default=None)

    # ISO 4217 code; snapshotted onto each invoice at creation.
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    # Numbering: f"{invoice_prefix}{next_invoice_number:0{number_padding}d}".
    invoice_prefix: Mapped[str] = mapped_column(String(16), default="INV-")
    next_invoice_number: Mapped[int] = mapped_column(Integer, default=1)
    number_padding: Mapped[int] = mapped_column(Integer, default=4)

    # Seeded onto a new invoice; each is editable per invoice afterward.
    default_due_days: Mapped[int] = mapped_column(Integer, default=14)
    default_tax_rate_percent: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("0"))
    payment_instructions: Mapped[str | None] = mapped_column(String(2048), default=None)
    default_notes: Mapped[str | None] = mapped_column(String(4096), default=None)


# A bill to one client, within one agency. client_id has no ondelete: a client
# with invoices can't be deleted out from under them (agencies/service.py's
# delete_client turns the FK violation into a friendly error, same as projects).
# Money is integer cents; percentages are Numeric. subtotal/discount/tax/total
# are denormalized — the service recomputes them on every line/discount/tax
# edit (see _recalculate) so the list view and reports never have to.
class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("agency_id", "number", name="uq_invoices_agency_id_number"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agency_clients.id"), index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), default=None, index=True
    )

    number: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(20), default=STATUS_DRAFT)
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    issue_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date)

    # At most one of these is set. discount_percent is a percentage (10.000 =
    # 10%); discount_amount_cents is a flat figure.
    discount_amount_cents: Mapped[int | None] = mapped_column(Integer, default=None)
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(6, 3), default=None)
    tax_rate_percent: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("0"))

    # Recomputed by the service — never set these by hand.
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0)
    discount_cents: Mapped[int] = mapped_column(Integer, default=0)
    tax_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_paid_cents: Mapped[int] = mapped_column(Integer, default=0)

    notes: Mapped[str | None] = mapped_column(String(4096), default=None)
    # Snapshotted from AgencyBillingSettings at creation, editable per invoice.
    payment_instructions: Mapped[str | None] = mapped_column(String(2048), default=None)

    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    issued_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    voided_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)


# A line on an invoice. amount_cents = round(quantity * unit_price_cents),
# computed by the service. position orders the lines top to bottom.
class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    description: Mapped[str] = mapped_column(String(1024))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("1"))
    unit_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)


# A payment received against an invoice, entered by a team member. When the
# sum of an invoice's payments covers its total, the service flips it to paid
# (see _apply_payments). The future client-portal "pay" flow will just add
# another way to create one of these.
class InvoicePayment(Base):
    __tablename__ = "invoice_payments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    recorded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    amount_cents: Mapped[int] = mapped_column(Integer)
    paid_on: Mapped[date] = mapped_column(Date)
    method: Mapped[str] = mapped_column(String(30), default="bank_transfer")
    reference: Mapped[str | None] = mapped_column(String(255), default=None)

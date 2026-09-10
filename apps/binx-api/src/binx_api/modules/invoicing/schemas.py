import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

# --- Billing settings ----------------------------------------------------


class BillingSettingsRead(BaseModel):
    agency_id: uuid.UUID
    legal_name: str | None
    address: str | None
    tax_id: str | None
    contact_email: str | None
    currency: str
    invoice_prefix: str
    next_invoice_number: int
    number_padding: int
    default_due_days: int
    default_tax_rate_percent: Decimal
    payment_instructions: str | None
    default_notes: str | None


class BillingSettingsUpdate(BaseModel):
    # Full replace — the settings form always submits every field together.
    legal_name: str | None = Field(default=None, max_length=255)
    address: str | None = Field(default=None, max_length=2048)
    tax_id: str | None = Field(default=None, max_length=64)
    contact_email: str | None = Field(default=None, max_length=255)
    currency: str = Field(pattern="^[A-Za-z]{3}$")
    invoice_prefix: str = Field(min_length=0, max_length=16)
    next_invoice_number: int = Field(ge=1)
    number_padding: int = Field(ge=1, le=9)
    default_due_days: int = Field(ge=0, le=365)
    default_tax_rate_percent: Decimal = Field(ge=0, le=100, max_digits=6, decimal_places=3)
    payment_instructions: str | None = Field(default=None, max_length=2048)
    default_notes: str | None = Field(default=None, max_length=4096)


# --- Line items --------------------------------------------------------


class LineItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=1024)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    unit_price_cents: int = Field(ge=0)


class LineItemRead(BaseModel):
    id: uuid.UUID
    position: int
    description: str
    quantity: Decimal
    unit_price_cents: int
    amount_cents: int


# --- Discount / tax (shared by create + update) -----------------------


class InvoiceTerms(BaseModel):
    discount_amount_cents: int | None = Field(default=None, ge=0)
    discount_percent: Decimal | None = Field(default=None, ge=0, le=100, max_digits=6, decimal_places=3)
    tax_rate_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=6, decimal_places=3)

    @model_validator(mode="after")
    def _one_discount_kind(self) -> "InvoiceTerms":
        if self.discount_amount_cents is not None and self.discount_percent is not None:
            raise ValueError("Set a flat discount or a percentage, not both")
        return self


class InvoiceCreate(InvoiceTerms):
    client_id: uuid.UUID
    project_id: uuid.UUID | None = None
    issue_date: date | None = None  # defaults to today
    due_date: date | None = None  # defaults to issue_date + settings.default_due_days
    notes: str | None = Field(default=None, max_length=4096)
    payment_instructions: str | None = Field(default=None, max_length=2048)
    line_items: list[LineItemInput] = Field(default_factory=list)


class InvoiceUpdate(InvoiceCreate):
    """Full replace of a draft invoice — same shape as create."""


# --- Reads -----------------------------------------------------------


class InvoiceParty(BaseModel):
    """The 'from' (agency) or 'bill to' (client) block on a rendered invoice."""

    name: str | None
    address: str | None
    email: str | None
    tax_id: str | None = None


class InvoiceRead(BaseModel):
    # Built by hand — client_name/display_status/amount_due_cents are joined /
    # derived, not columns.
    id: uuid.UUID
    agency_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    project_id: uuid.UUID | None
    project_name: str | None
    number: str
    status: str
    # draft | sent | paid | void | overdue | partial — see service._display_status
    display_status: str
    currency: str
    issue_date: date
    due_date: date
    subtotal_cents: int
    discount_cents: int
    tax_cents: int
    total_cents: int
    amount_paid_cents: int
    amount_due_cents: int
    created_at: datetime


class PaymentRead(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    amount_cents: int
    paid_on: date
    method: str
    reference: str | None
    recorded_by_name: str | None
    created_at: datetime


class InvoiceDetailRead(InvoiceRead):
    discount_amount_cents: int | None
    discount_percent: Decimal | None
    tax_rate_percent: Decimal
    notes: str | None
    payment_instructions: str | None
    issued_at: datetime | None
    voided_at: datetime | None
    from_: InvoiceParty = Field(alias="from")
    bill_to: InvoiceParty
    line_items: list[LineItemRead]
    payments: list[PaymentRead]

    model_config = {"populate_by_name": True}


class PaymentCreate(BaseModel):
    amount_cents: int = Field(gt=0)
    paid_on: date
    method: str = Field(pattern="^(bank_transfer|check|card|cash|other)$")
    reference: str | None = Field(default=None, max_length=255)


class IssueInvoiceRequest(BaseModel):
    # Email the client's billing address a plain-text notice (no portal link yet).
    send_notice: bool = False


class TimePoint(BaseModel):
    label: str
    value: int


class InvoiceSummaryRead(BaseModel):
    outstanding_cents: int
    overdue_cents: int
    paid_this_year_cents: int
    lifetime_billed_cents: int
    average_invoice_cents: int
    draft_count: int
    open_count: int
    overdue_count: int
    monthly_paid: list[TimePoint]

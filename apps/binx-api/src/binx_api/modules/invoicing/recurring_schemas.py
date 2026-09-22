import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class RecurringLineItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=1024)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    unit_price_cents: int = Field(ge=0)


class RecurringLineItemRead(BaseModel):
    id: uuid.UUID
    position: int
    description: str
    quantity: Decimal
    unit_price_cents: int


class RecurringScheduleCreate(BaseModel):
    client_id: uuid.UUID
    project_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    interval: str = Field(pattern="^(weekly|monthly)$")
    interval_count: int = Field(default=1, ge=1, le=12)
    day_of_month: int | None = Field(default=None, ge=1, le=28)
    weekday: int | None = Field(default=None, ge=0, le=6)
    due_days: int = Field(default=14, ge=0, le=365)
    tax_rate_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=6, decimal_places=3)
    notes: str | None = Field(default=None, max_length=4096)
    payment_instructions: str | None = Field(default=None, max_length=2048)
    auto_issue: bool = False
    # When to generate the first invoice. Defaults to today (so a schedule
    # created "for this month" bills right away on the next catch-up).
    start_date: date | None = None
    line_items: list[RecurringLineItemInput] = Field(min_length=1)

    @model_validator(mode="after")
    def _interval_fields(self) -> "RecurringScheduleCreate":
        if self.interval == "monthly" and self.day_of_month is None:
            raise ValueError("day_of_month is required for a monthly schedule")
        if self.interval == "weekly" and self.weekday is None:
            raise ValueError("weekday is required for a weekly schedule")
        return self


class RecurringScheduleUpdate(RecurringScheduleCreate):
    """Full replace, same shape as create. Doesn't reset next_run_date unless
    start_date is given — see recurring_service.update_schedule."""


class RecurringScheduleRead(BaseModel):
    id: uuid.UUID
    agency_id: uuid.UUID
    client_id: uuid.UUID
    client_name: str
    project_id: uuid.UUID | None
    project_name: str | None
    title: str
    interval: str
    interval_count: int
    day_of_month: int | None
    weekday: int | None
    due_days: int
    tax_rate_percent: Decimal
    auto_issue: bool
    is_active: bool
    next_run_date: date
    last_run_at: datetime | None
    last_generated_invoice_id: uuid.UUID | None
    line_items: list[RecurringLineItemRead]
    estimated_amount_cents: int

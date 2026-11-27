import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

PricingType = str  # validated by the pattern below: fixed | hourly | monthly
_PRICING_PATTERN = "^(fixed|hourly|monthly)$"


class ServiceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    pricing_type: PricingType = Field(default="fixed", pattern=_PRICING_PATTERN)
    unit_price_cents: int = Field(ge=0)
    default_quantity: Decimal = Field(default=Decimal("1"), gt=0, max_digits=12, decimal_places=2)


class ServiceUpdate(BaseModel):
    """Partial update — only the fields sent change."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    pricing_type: PricingType | None = Field(default=None, pattern=_PRICING_PATTERN)
    unit_price_cents: int | None = Field(default=None, ge=0)
    default_quantity: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    is_archived: bool | None = None


class ServiceRead(BaseModel):
    id: uuid.UUID
    agency_id: uuid.UUID
    name: str
    description: str | None
    pricing_type: str
    unit_price_cents: int
    default_quantity: Decimal
    is_archived: bool
    created_at: datetime

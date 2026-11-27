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
    # The price is where it starts ("From $2,500"), adjusted per proposal.
    is_starting_price: bool = False
    category_id: uuid.UUID | None = None


class ServiceUpdate(BaseModel):
    """Partial update — only the fields sent change."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    pricing_type: PricingType | None = Field(default=None, pattern=_PRICING_PATTERN)
    unit_price_cents: int | None = Field(default=None, ge=0)
    default_quantity: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    is_archived: bool | None = None
    is_starting_price: bool | None = None
    # Send null to take it out of its category.
    category_id: uuid.UUID | None = None


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
    is_starting_price: bool = False
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    attachments: list["ServiceAttachmentRead"] = Field(default_factory=list)


class ServiceAttachmentRead(BaseModel):
    id: uuid.UUID
    file_name: str
    mime_type: str
    size: int
    created_at: datetime


class ServiceCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ServiceCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    position: int | None = Field(default=None, ge=0, le=1000)


class ServiceCategoryRead(BaseModel):
    id: uuid.UUID
    name: str
    position: int
    # Services in it, archived ones included.
    service_count: int

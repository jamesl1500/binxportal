"""Services: an agency's catalog of what it sells — "Brand strategy, $5,000
fixed", "Design retainer, $2,000 / month" — that staff pick from when
building a proposal, an invoice, or a recurring invoice schedule.

A line item made from a service *copies* its name, description and price
(and keeps ``service_id`` only to record where it came from). Editing or
archiving a service never changes a proposal or invoice that already used
it — the same "frozen once issued" rule documents follow everywhere else.
"""

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

PRICING_FIXED = "fixed"
PRICING_HOURLY = "hourly"
PRICING_MONTHLY = "monthly"

pricing_types: list[str] = [PRICING_FIXED, PRICING_HOURLY, PRICING_MONTHLY]
# How each type reads in exports (and lib/services-client.ts's labels).
PRICING_TYPE_LABELS: dict[str, str] = {
    PRICING_FIXED: "Fixed price",
    PRICING_HOURLY: "Hourly",
    PRICING_MONTHLY: "Monthly",
}


class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    name: Mapped[str] = mapped_column(String(255))
    # What the client reads under the line on a proposal — plain text.
    description: Mapped[str | None] = mapped_column(Text, default=None)
    # fixed | hourly | monthly. Informational for now (labels the price and
    # seeds the quantity); the lead-portal work will use "monthly" to start a
    # recurring schedule when a proposal is accepted.
    pricing_type: Mapped[str] = mapped_column(String(20), default=PRICING_FIXED)
    # In the agency's own currency (AgencyBillingSettings.currency) — the
    # catalog carries no currency of its own.
    unit_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    default_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("1"))

    # Archived services stay on the documents that used them but drop out of
    # the pickers. Deleting outright is also allowed (line items keep their
    # copied values; service_id goes NULL).
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

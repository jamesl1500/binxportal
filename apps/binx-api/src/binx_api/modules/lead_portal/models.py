"""Lead portals: a branded page an agency shares with a lead before they're
a client, holding the proposals they've been sent, a welcome note, and a
question-and-answer thread with the team. Once the lead signs and is set up
as a client (proposals/acceptance.py), the page points them to their client
portal instead.

The link is a share token kept in the clear, like a proposal's: staff copy
it whenever they need to and can reset it, which cuts off the old one.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

AUTHOR_LEAD = "lead"
AUTHOR_AGENCY = "agency"


class LeadPortal(Base):
    __tablename__ = "lead_portals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), unique=True, index=True)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # A note at the top of the page, from the agency.
    welcome_message: Mapped[str | None] = mapped_column(Text, default=None)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


# The question-and-answer thread on a lead portal. The lead writes with no
# account (their name is what they typed, or the lead's contact name); the
# agency replies from the lead's page.
class LeadPortalMessage(Base):
    __tablename__ = "lead_portal_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    author_kind: Mapped[str] = mapped_column(String(10))  # lead | agency
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    author_name: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)

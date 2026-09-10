import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# Client-invitation lifecycle — mirrors agencies/models.py's INVITATION_* so
# the two invite flows read the same, even though accepting them does
# different things (AgencyMember vs ClientContact).
CONTACT_INVITATION_PENDING = "pending"
CONTACT_INVITATION_ACCEPTED = "accepted"
CONTACT_INVITATION_REVOKED = "revoked"


# A person on the client's side who has portal access to one AgencyClient.
# They hold a normal Binx `User` account (same login, verification, messaging,
# invoice-payment plumbing as staff) — this row is what grants them the
# client-facing `/portal` view and scopes it to one client.
class ClientContact(Base):
    __tablename__ = "client_contacts"
    __table_args__ = (UniqueConstraint("client_id", "user_id", name="uq_client_contacts_client_id_user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agency_clients.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # The first contact invited for a client is the primary — a light marker
    # for the staff UI, not a permission boundary (all contacts see the same
    # portal today).
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    # Their role/title at the client org, shown on the staff "Portal contacts"
    # panel — free text, optional.
    title: Mapped[str | None] = mapped_column(String(255), default=None)


# An outstanding (or resolved) invite for someone to become a client contact.
# Kept separate from AgencyInvitation: accepting this creates a ClientContact,
# the accept link points at the portal, and the email copy differs. The
# invitee doesn't need an account yet — they're identified by email until
# they accept, at which point the ClientContact is tied to whichever account
# holds that address.
class ClientInvitation(Base):
    __tablename__ = "client_invitations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agency_clients.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    invited_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # Only the hash is stored; the raw token only ever reaches the invited address.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default=CONTACT_INVITATION_PENDING)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

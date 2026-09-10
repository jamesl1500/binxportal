import uuid

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# An entry is either agency business (visible to the agency, per `visibility`)
# or a personal security event (visible only to the account it's about,
# regardless of `visibility` — a login or password change is never agency
# business, even though it's logged the same way).
SCOPE_AGENCY = "agency"
SCOPE_ACCOUNT = "account"

# Coarse buckets, mirroring notifications.models' categories where they
# overlap. Drives the icon/grouping on the frontend.
CATEGORY_TEAM = "team"
CATEGORY_CLIENTS = "clients"
CATEGORY_PROJECTS = "projects"
CATEGORY_INVOICING = "invoicing"
CATEGORY_SETTINGS = "settings"
CATEGORY_SECURITY = "security"

# Who can see an agency-scoped entry. Set per event_type at the call site
# (see each module's producer) rather than derived from category — most of a
# category is team-visible, with a few sensitive event types (role changes,
# removals, billing) held back to owners/admins.
VISIBILITY_TEAM = "team"
VISIBILITY_ADMIN = "admin"


# An append-only audit / activity trail entry. Deliberately denormalized
# (actor_name, target_name are snapshots, like Message.sender_name) so history
# still reads correctly after someone leaves the agency or a target is
# renamed/deleted. There is no update path — entries are written once and
# never edited, only ever listed.
class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    scope: Mapped[str] = mapped_column(String(20), default=SCOPE_AGENCY)
    # Set for SCOPE_AGENCY entries; null for SCOPE_ACCOUNT ones.
    agency_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agencies.id", ondelete="CASCADE"), default=None, index=True
    )
    # Set for SCOPE_ACCOUNT entries — whose personal security history this is.
    subject_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=None, index=True
    )

    category: Mapped[str] = mapped_column(String(50))
    event_type: Mapped[str] = mapped_column(String(50))
    # Only meaningful for SCOPE_AGENCY — see VISIBILITY_* above.
    visibility: Mapped[str] = mapped_column(String(20), default=VISIBILITY_TEAM)

    # A ready-to-render sentence, e.g. "Alice removed Bob from the agency" —
    # same "snapshot the text, not structured fields" approach as messaging's
    # system messages, so history reads correctly regardless of what changes
    # later.
    summary: Mapped[str] = mapped_column(String(500))

    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    actor_name: Mapped[str | None] = mapped_column(String(255), default=None)

    # A loose pointer to whatever the event was about (a client, project,
    # invoice, member...) — no FK, since it spans many tables and the row must
    # survive the target's deletion. target_name is the display snapshot.
    target_type: Mapped[str | None] = mapped_column(String(50), default=None)
    target_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, default=None)
    target_name: Mapped[str | None] = mapped_column(String(255), default=None)

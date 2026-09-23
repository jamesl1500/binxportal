import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# The sales pipeline a lead moves through. "won" is set on conversion to a
# client; "lost" carries a `lost_reason`.
LEAD_STATUSES: list[str] = ["new", "contacted", "qualified", "proposal", "won", "lost"]
# Everything before won/lost is an "open" lead (what the pipeline stats count).
LEAD_OPEN_STATUSES: set[str] = {"new", "contacted", "qualified", "proposal"}

# Where the lead came from. "ai_generated" is reserved for the future
# lead-finder — see modules/leads/service.py::analyze_lead for the AI seam.
LEAD_SOURCES: list[str] = ["manual", "referral", "inbound", "import", "ai_generated"]

# The AI analysis's at-a-glance fit read.
LEAD_FIT_LEVELS: list[str] = ["strong", "moderate", "weak"]

# LeadEvent kinds — the append-only per-lead timeline.
EVENT_CREATED = "created"
EVENT_NOTE = "note"
EVENT_STATUS_CHANGED = "status_changed"
EVENT_OWNER_CHANGED = "owner_changed"
EVENT_CONVERTED = "converted"
EVENT_ANALYZED = "analyzed"


# A prospect the agency is working, before they become an AgencyClient.
# Deliberately shaped like AgencyClient's contact block so `convert_lead` can
# hand the fields straight to agencies/service.py::create_client.
class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(255))
    contact_name: Mapped[str | None] = mapped_column(String(255), default=None)
    contact_email: Mapped[str | None] = mapped_column(String(255), default=None)
    contact_phone: Mapped[str | None] = mapped_column(String(32), default=None)
    website: Mapped[str | None] = mapped_column(String(2048), default=None)

    status: Mapped[str] = mapped_column(String(20), default="new")
    source: Mapped[str] = mapped_column(String(20), default="manual")
    # The agency member responsible for this lead. SET NULL so removing someone
    # from the agency doesn't take their leads with them.
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)

    notes: Mapped[str | None] = mapped_column(String(8192), default=None)
    estimated_value_cents: Mapped[int | None] = mapped_column(Integer, default=None)

    # ---- AI analysis (filled by analyze_lead — a real Claude call, with a
    #      completeness-heuristic fallback; see leads/service.py) ----
    score: Mapped[int | None] = mapped_column(Integer, default=None)  # 0–100
    ai_summary: Mapped[str | None] = mapped_column(String(8192), default=None)  # prose only
    ai_talking_points: Mapped[str | None] = mapped_column(Text, default=None)  # JSON list[str]
    ai_next_step: Mapped[str | None] = mapped_column(String(1024), default=None)
    ai_fit: Mapped[str | None] = mapped_column(String(16), default=None)  # strong | moderate | weak
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    # ---- Lifecycle ----
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    lost_reason: Mapped[str | None] = mapped_column(String(1024), default=None)
    converted_client_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agency_clients.id", ondelete="SET NULL"), default=None
    )
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


# One entry on a lead's timeline. Append-only; `actor_name` is snapshotted like
# messaging's sender_name so history reads right after someone leaves.
class LeadEvent(Base):
    __tablename__ = "lead_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    lead_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)

    kind: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(String(2048))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    actor_name: Mapped[str | None] = mapped_column(String(255), default=None)


# A staff-configured, reusable prospecting search — the AI prospector's
# "saved search" (see leads/router.py's /search-criteria endpoints). Running
# one hands these fields to ai/service.py::find_prospects as its brief; see
# find_prospects for how industry/location/radius_miles/keywords get turned
# into a Google Places query plus the web-search prompt.
class LeadSearchCriteria(Base):
    __tablename__ = "lead_search_criteria"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)

    name: Mapped[str] = mapped_column(String(255))
    industry: Mapped[str | None] = mapped_column(String(200), default=None)
    location: Mapped[str | None] = mapped_column(String(200), default=None)
    # Folded into the Places query text (e.g. "...within 25 miles of Austin,
    # TX") rather than a real geo filter — a true radius search needs the
    # location geocoded to lat/lng first, which find_prospects doesn't do.
    radius_miles: Mapped[int | None] = mapped_column(Integer, default=None)
    company_size: Mapped[str | None] = mapped_column(String(100), default=None)
    keywords: Mapped[str | None] = mapped_column(String(500), default=None)
    count: Mapped[int] = mapped_column(Integer, default=5)

    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), default=None)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_run_result_count: Mapped[int | None] = mapped_column(Integer, default=None)

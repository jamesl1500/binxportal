import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from binx_api.core.database import Base

# What each AiUsageEvent/AiConversation call was for — the "feature" label the
# usage panel groups by. Kept a plain string (not a DB enum) so a new feature
# never needs a migration.
FEATURE_LEAD_ANALYSIS = "lead_analysis"
FEATURE_LEAD_GENERATION = "lead_generation"
FEATURE_DASHBOARD_BRIEFING = "dashboard_briefing"
FEATURE_PROJECT_SUMMARY = "project_summary"
FEATURE_INVOICE_REMINDER = "invoice_reminder"
FEATURE_ASSISTANT = "assistant"

ai_features: list[str] = [
    FEATURE_LEAD_ANALYSIS,
    FEATURE_LEAD_GENERATION,
    FEATURE_DASHBOARD_BRIEFING,
    FEATURE_PROJECT_SUMMARY,
    FEATURE_INVOICE_REMINDER,
    FEATURE_ASSISTANT,
]

# How a call resolved. "blocked" = never reached Anthropic (no key configured,
# or the agency's monthly budget / a user's daily cap was already used up).
STATUS_OK = "ok"
STATUS_ERROR = "error"
STATUS_BLOCKED = "blocked"

ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"


# Per-agency AI configuration — lazy-created on first access, same pattern as
# invoicing's AgencyBillingSettings and agencies' AgencyProfile. Seeded from
# Settings.ai_default_* the first time an agency touches any AI feature.
class AgencyAiSettings(Base):
    __tablename__ = "agency_ai_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), unique=True, index=True)

    is_enabled: Mapped[bool] = mapped_column(default=True)
    # USD cents. Every ok-status AiUsageEvent this calendar month counts
    # against this; see ai/client.py::check_budget_and_rate.
    monthly_budget_cents: Mapped[int] = mapped_column(Integer)
    # Per-member, resets at midnight UTC — counts every event (ok/error/
    # blocked) for that user today, not just successful ones.
    daily_user_request_cap: Mapped[int] = mapped_column(Integer)


# One row per Claude API call, whatever the outcome. This is both the audit
# trail and the data the budget/cap checks and the usage panel read from —
# nothing about spend is tracked anywhere else.
class AiUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    # SET NULL (not CASCADE): a usage event is agency-level spend history —
    # it outlives the member who triggered it if they're later removed.
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)

    feature: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(50))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10))
    error_message: Mapped[str | None] = mapped_column(String(1024), default=None)


# One "Ask AI" chat thread. Personal to the member who started it — see
# ai/router.py, which always scopes reads/writes to (agency_id, user_id).
class AiConversation(Base):
    __tablename__ = "ai_conversations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # The first user message, truncated — a label for the conversation list.
    title: Mapped[str | None] = mapped_column(String(255), default=None)


# One human-readable turn in a conversation. Only user/assistant text is
# persisted — a turn's tool calls and tool results live in memory for that
# one pass through ai/service.py::assistant_reply's loop and aren't replayed;
# the next turn re-runs its own fresh tool calls against live data instead.
class AiConversationMessage(Base):
    __tablename__ = "ai_conversation_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(String(8192))


# One cached briefing per (agency, member, day) — see
# ai/service.py::get_dashboard_briefing. The dashboard used to call Claude
# fresh on every page load; this is what makes the second-and-later load in
# a day free and instant. `briefing_date` is a UTC calendar day, matching
# AgencyAiSettings.daily_user_request_cap's reset convention.
class DashboardBriefing(Base):
    __tablename__ = "dashboard_briefings"
    __table_args__ = (
        UniqueConstraint("agency_id", "user_id", "briefing_date", name="uq_dashboard_briefings_agency_user_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    briefing_date: Mapped[date] = mapped_column(Date)
    content: Mapped[str] = mapped_column(Text)

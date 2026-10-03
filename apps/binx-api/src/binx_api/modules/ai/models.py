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
FEATURE_LEAD_FOLLOWUP = "lead_followup"
FEATURE_DASHBOARD_BRIEFING = "dashboard_briefing"
FEATURE_PROJECT_SUMMARY = "project_summary"
FEATURE_PROJECT_TASKS = "project_tasks"
FEATURE_INVOICE_REMINDER = "invoice_reminder"
FEATURE_MESSAGE_REPLY = "message_reply"
FEATURE_ASSISTANT = "assistant"

ai_features: list[str] = [
    FEATURE_LEAD_ANALYSIS,
    FEATURE_LEAD_GENERATION,
    FEATURE_LEAD_FOLLOWUP,
    FEATURE_DASHBOARD_BRIEFING,
    FEATURE_PROJECT_SUMMARY,
    FEATURE_PROJECT_TASKS,
    FEATURE_INVOICE_REMINDER,
    FEATURE_MESSAGE_REPLY,
    FEATURE_ASSISTANT,
]

# How a call resolved. "blocked" = never reached Anthropic (no key configured,
# or the agency's monthly budget / a user's daily cap was already used up).
STATUS_OK = "ok"
STATUS_ERROR = "error"
STATUS_BLOCKED = "blocked"

ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"

# AiAction.status. "pending" = proposed and waiting on the member's
# Approve/Decline; the other three are terminal.
ACTION_PENDING = "pending"
ACTION_APPLIED = "applied"
ACTION_DECLINED = "declined"
ACTION_FAILED = "failed"

# AiUserPreferences choices — plain strings, validated by the schema's
# Literal types, so adding one never needs a migration.
RESPONSE_LENGTHS: list[str] = ["concise", "balanced", "detailed"]
TONES: list[str] = ["professional", "friendly", "casual"]

# What a member who never opened the settings dropdown gets — both the
# column defaults below and ai/service.py::get_preferences' unsaved fallback.
PREFERENCE_DEFAULTS: dict[str, object] = {
    "response_length": "balanced",
    "tone": "professional",
    "allow_actions": True,
    "confirm_actions": True,
    "voice_auto_send": True,
    "custom_instructions": None,
}


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


# One member's "Ask AI" preferences (the modal's settings dropdown). Personal
# like AiConversation — scoped to (agency, user), lazy-created on first save;
# a member who never opened the dropdown just gets the column defaults (see
# ai/service.py::get_preferences).
class AiUserPreferences(Base):
    __tablename__ = "ai_user_preferences"
    __table_args__ = (UniqueConstraint("agency_id", "user_id", name="uq_ai_user_preferences_agency_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agencies.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    response_length: Mapped[str] = mapped_column(String(20), default=PREFERENCE_DEFAULTS["response_length"])
    tone: Mapped[str] = mapped_column(String(20), default=PREFERENCE_DEFAULTS["tone"])
    # Whether the assistant may change data at all, and if so whether each
    # change waits for the member's Approve (see AiAction).
    allow_actions: Mapped[bool] = mapped_column(default=PREFERENCE_DEFAULTS["allow_actions"])
    confirm_actions: Mapped[bool] = mapped_column(default=PREFERENCE_DEFAULTS["confirm_actions"])
    # Voice input: send the transcript as soon as the speaker pauses, vs.
    # drop it into the composer to review first. Purely a client-side switch.
    voice_auto_send: Mapped[bool] = mapped_column(default=PREFERENCE_DEFAULTS["voice_auto_send"])
    custom_instructions: Mapped[str | None] = mapped_column(String(1000), default=None)


# One change the assistant made, or proposed to make, on the member's behalf
# — both the Approve/Decline queue and the audit trail. `tool`/`input` are
# exactly what Claude asked for, so approving later replays that same call
# (ai/service.py::approve_action) against live data.
class AiAction(Base):
    __tablename__ = "ai_actions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True
    )
    # The assistant turn that proposed it — set once that turn is persisted
    # at the end of the tool loop, so briefly NULL while the turn is running.
    message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ai_conversation_messages.id", ondelete="CASCADE"), index=True, default=None
    )
    tool: Mapped[str] = mapped_column(String(50))
    input: Mapped[str] = mapped_column(Text)  # JSON
    summary: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(10))
    # What happened when it ran — the success line or the error. NULL while pending/declined.
    result: Mapped[str | None] = mapped_column(String(1024), default=None)

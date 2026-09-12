import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AiSettingsRead(BaseModel):
    is_enabled: bool
    monthly_budget_cents: int
    daily_user_request_cap: int
    configured: bool  # whether ANTHROPIC_API_KEY is set at all — read-only
    # The current plan's ceilings — the settings above can go lower but not
    # higher (ai/client.py::check_budget_and_rate).
    plan_monthly_budget_cents: int
    plan_daily_user_cap: int


class AiSettingsUpdate(BaseModel):
    is_enabled: bool
    monthly_budget_cents: int = Field(ge=0)
    daily_user_request_cap: int = Field(ge=1)


class AiUsageEventRead(BaseModel):
    id: uuid.UUID
    feature: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_cents: int
    status: str
    error_message: str | None
    user_name: str | None
    created_at: datetime


class AiUsageSummaryRead(BaseModel):
    configured: bool
    is_enabled: bool
    monthly_budget_cents: int
    month_spent_cents: int
    daily_user_request_cap: int
    today_request_count: int
    plan_monthly_budget_cents: int
    plan_daily_user_cap: int
    recent_events: list[AiUsageEventRead]


class AiBriefingRead(BaseModel):
    briefing: str


class AiDraftRead(BaseModel):
    draft: str


class AiTaskSuggestion(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4096)


class AiTaskListSuggestion(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    tasks: list[AiTaskSuggestion]


class AiTaskSuggestionsRead(BaseModel):
    lists: list[AiTaskListSuggestion]


class AiConversationRead(BaseModel):
    id: uuid.UUID
    title: str | None
    created_at: datetime
    updated_at: datetime | None = None


class AiMessageRead(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class AiMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=4000)

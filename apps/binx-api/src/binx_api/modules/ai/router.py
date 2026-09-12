import json
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from binx_api.core.config import get_settings
from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.ai import client as ai_client
from binx_api.modules.ai import service
from binx_api.modules.ai.models import AiUsageEvent
from binx_api.modules.ai.schemas import (
    AiBriefingRead,
    AiConversationRead,
    AiMessageCreate,
    AiMessageRead,
    AiSettingsRead,
    AiSettingsUpdate,
    AiUsageEventRead,
    AiUsageSummaryRead,
)
from binx_api.modules.billing import service as billing_service
from binx_api.modules.users.models import User

router = APIRouter(prefix="/agencies/{agency_id}/ai", tags=["ai"])
settings = get_settings()

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
AgencyAndRole = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


def _settings_read(ai_settings, limits) -> AiSettingsRead:
    return AiSettingsRead(
        is_enabled=ai_settings.is_enabled,
        monthly_budget_cents=ai_settings.monthly_budget_cents,
        daily_user_request_cap=ai_settings.daily_user_request_cap,
        configured=bool(settings.anthropic_api_key),
        plan_monthly_budget_cents=limits.ai_monthly_budget_cents,
        plan_daily_user_cap=limits.ai_daily_user_cap,
    )


@router.get("/settings", response_model=AiSettingsRead)
async def get_ai_settings(db: DbSession, agency_and_role: AnyMember) -> AiSettingsRead:
    agency, _role = agency_and_role
    ai_settings = await ai_client.get_or_create_ai_settings(db, agency.id)
    limits = await billing_service.get_plan_limits(db, agency.id)
    return _settings_read(ai_settings, limits)


@router.patch("/settings", response_model=AiSettingsRead)
async def update_ai_settings(
    db: DbSession, data: AiSettingsUpdate, current_user: CurrentUser, agency_and_role: AgencyAndRole
) -> AiSettingsRead:
    agency, _role = agency_and_role
    ai_settings = await ai_client.get_or_create_ai_settings(db, agency.id)
    limits = await billing_service.get_plan_limits(db, agency.id)
    ai_settings.is_enabled = data.is_enabled
    # The plan sets the ceiling — clamp anything above it rather than 422.
    ai_settings.monthly_budget_cents = min(data.monthly_budget_cents, limits.ai_monthly_budget_cents)
    ai_settings.daily_user_request_cap = min(data.daily_user_request_cap, limits.ai_daily_user_cap)
    await db.commit()
    await db.refresh(ai_settings)
    return _settings_read(ai_settings, limits)


@router.get("/usage", response_model=AiUsageSummaryRead)
async def get_ai_usage(db: DbSession, agency_and_role: AnyMember, current_user: CurrentUser) -> AiUsageSummaryRead:
    agency, _role = agency_and_role
    ai_settings = await ai_client.get_or_create_ai_settings(db, agency.id)
    limits = await billing_service.get_plan_limits(db, agency.id)

    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    spent = await db.execute(
        select(func.coalesce(func.sum(AiUsageEvent.cost_cents), 0)).where(
            AiUsageEvent.agency_id == agency.id, AiUsageEvent.status == "ok", AiUsageEvent.created_at >= month_start
        )
    )
    today_count = await db.execute(
        select(func.count())
        .select_from(AiUsageEvent)
        .where(
            AiUsageEvent.agency_id == agency.id,
            AiUsageEvent.user_id == current_user.id,
            AiUsageEvent.created_at >= day_start,
        )
    )
    recent = await db.execute(
        select(AiUsageEvent, User.full_name)
        .outerjoin(User, User.id == AiUsageEvent.user_id)
        .where(AiUsageEvent.agency_id == agency.id)
        .order_by(AiUsageEvent.created_at.desc())
        .limit(20)
    )

    return AiUsageSummaryRead(
        configured=bool(settings.anthropic_api_key),
        is_enabled=ai_settings.is_enabled,
        monthly_budget_cents=ai_settings.monthly_budget_cents,
        month_spent_cents=spent.scalar_one(),
        daily_user_request_cap=ai_settings.daily_user_request_cap,
        today_request_count=today_count.scalar_one(),
        plan_monthly_budget_cents=limits.ai_monthly_budget_cents,
        plan_daily_user_cap=limits.ai_daily_user_cap,
        recent_events=[
            AiUsageEventRead(
                id=event.id,
                feature=event.feature,
                model=event.model,
                input_tokens=event.input_tokens,
                output_tokens=event.output_tokens,
                cost_cents=event.cost_cents,
                status=event.status,
                error_message=event.error_message,
                user_name=user_name,
                created_at=event.created_at,
            )
            for event, user_name in recent.all()
        ],
    )


@router.get("/briefing", response_model=AiBriefingRead)
async def get_ai_briefing(
    db: DbSession,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
    refresh: bool = Query(default=False, description="Regenerate today's briefing even if one is already cached"),
) -> AiBriefingRead:
    agency, _role = agency_and_role
    text = await service.get_dashboard_briefing(db, agency, current_user, force=refresh)
    return AiBriefingRead(briefing=text)


@router.post("/conversations", response_model=AiConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember
) -> AiConversationRead:
    agency, _role = agency_and_role
    conversation = await service.create_conversation(db, agency.id, current_user.id)
    return AiConversationRead.model_validate(conversation, from_attributes=True)


@router.get("/conversations", response_model=list[AiConversationRead])
async def list_conversations(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember
) -> list[AiConversationRead]:
    agency, _role = agency_and_role
    conversations = await service.list_conversations(db, agency.id, current_user.id)
    return [AiConversationRead.model_validate(c, from_attributes=True) for c in conversations]


@router.get("/conversations/{conversation_id}/messages", response_model=list[AiMessageRead])
async def list_conversation_messages(
    db: DbSession, conversation_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AnyMember
) -> list[AiMessageRead]:
    agency, _role = agency_and_role
    conversation = await service.get_conversation_or_404(db, agency.id, current_user.id, conversation_id)
    messages = await service.list_conversation_messages(db, conversation.id)
    return [AiMessageRead.model_validate(m, from_attributes=True) for m in messages]


@router.post(
    "/conversations/{conversation_id}/messages", response_model=AiMessageRead, status_code=status.HTTP_201_CREATED
)
async def send_conversation_message(
    db: DbSession,
    conversation_id: uuid.UUID,
    data: AiMessageCreate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> AiMessageRead:
    agency, _role = agency_and_role
    conversation = await service.get_conversation_or_404(db, agency.id, current_user.id, conversation_id)
    await service.assistant_reply(db, conversation, agency, actor=current_user, user_message=data.message)
    # assistant_reply persists both the user turn and the assistant turn
    # before returning, so the last message is always the reply just made.
    messages = await service.list_conversation_messages(db, conversation.id)
    return AiMessageRead.model_validate(messages[-1], from_attributes=True)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_conversation_message(
    db: DbSession,
    conversation_id: uuid.UUID,
    data: AiMessageCreate,
    current_user: CurrentUser,
    agency_and_role: AnyMember,
) -> StreamingResponse:
    """Same request as ``POST .../messages``, but the reply streams in as
    Server-Sent Events instead of arriving all at once. Once streaming
    starts the HTTP status/headers are already sent, so an error mid-stream
    can't become an HTTP error response — it's relayed as an in-band
    ``{"type": "error"}`` event instead, and the generator ends there
    (no ``done`` event follows an ``error``)."""
    agency, _role = agency_and_role
    conversation = await service.get_conversation_or_404(db, agency.id, current_user.id, conversation_id)

    async def event_stream():
        try:
            async for chunk in service.assistant_reply_stream(
                db, conversation, agency, actor=current_user, user_message=data.message
            ):
                yield _sse({"type": "delta", "text": chunk})
            yield _sse({"type": "done"})
        except Exception as exc:  # must never crash the stream silently — always tell the client
            message = exc.detail if hasattr(exc, "detail") else "Something went wrong generating that reply."
            yield _sse({"type": "error", "message": str(message)})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    db: DbSession, conversation_id: uuid.UUID, current_user: CurrentUser, agency_and_role: AnyMember
) -> None:
    agency, _role = agency_and_role
    conversation = await service.get_conversation_or_404(db, agency.id, current_user.id, conversation_id)
    await service.delete_conversation(db, conversation)

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response, status

from binx_api.core.dependencies import CurrentUser, DbSession, require_role
from binx_api.modules.feedback import service
from binx_api.modules.feedback.models import Feedback
from binx_api.modules.feedback.schemas import (
    FeedbackAdminList,
    FeedbackAdminRead,
    FeedbackAdminUpdate,
    FeedbackCreate,
    FeedbackPulseAnswer,
    FeedbackPulseRead,
    FeedbackRead,
    FeedbackSummary,
)
from binx_api.modules.users.models import ROLE_ADMIN, User

# Anyone signed in — agency staff and portal clients alike.
router = APIRouter(prefix="/feedback", tags=["feedback"])

# The Binx team: platform admins (the global User.role, not an agency role).
admin_router = APIRouter(prefix="/admin/feedback", tags=["feedback-admin"])
PlatformAdmin = Annotated[User, Depends(require_role(ROLE_ADMIN))]

_PULSE_KEY = Annotated[str, Path(max_length=32)]


def _admin_read(feedback: Feedback, agency_name: str | None, client_name: str | None) -> FeedbackAdminRead:
    return FeedbackAdminRead.model_validate(
        {
            **FeedbackRead.model_validate(feedback).model_dump(),
            "user_id": feedback.user_id,
            "user_name": feedback.user_name,
            "user_email": feedback.user_email,
            "agency_id": feedback.agency_id,
            "agency_name": agency_name,
            "client_id": feedback.client_id,
            "client_name": client_name,
            "pulse_key": feedback.pulse_key,
            "user_agent": feedback.user_agent,
            "viewport": feedback.viewport,
            "allow_contact": feedback.allow_contact,
            "internal_note": feedback.internal_note,
            "updated_at": feedback.updated_at,
        }
    )


# --- Submitter -------------------------------------------------------------


@router.post("", response_model=FeedbackRead, status_code=status.HTTP_201_CREATED)
async def submit_feedback(db: DbSession, current_user: CurrentUser, data: FeedbackCreate) -> Feedback:
    return await service.submit_feedback(db, current_user, data)


@router.get("/mine", response_model=list[FeedbackRead])
async def list_my_feedback(db: DbSession, current_user: CurrentUser) -> list[Feedback]:
    return await service.list_my_feedback(db, current_user)


@router.get("/pulse", response_model=FeedbackPulseRead)
async def get_pulse(db: DbSession, current_user: CurrentUser) -> FeedbackPulseRead:
    return FeedbackPulseRead(pulse_key=await service.get_due_pulse(db, current_user))


@router.post("/pulse/{pulse_key}", response_model=FeedbackRead, status_code=status.HTTP_201_CREATED)
async def answer_pulse(
    pulse_key: _PULSE_KEY, db: DbSession, current_user: CurrentUser, data: FeedbackPulseAnswer
) -> Feedback:
    return await service.answer_pulse(db, current_user, pulse_key, data)


@router.post("/pulse/{pulse_key}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_pulse(pulse_key: _PULSE_KEY, db: DbSession, current_user: CurrentUser) -> Response:
    await service.dismiss_pulse(db, current_user, pulse_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Binx team -------------------------------------------------------------


@admin_router.get("", response_model=FeedbackAdminList)
async def list_feedback(
    db: DbSession,
    _admin: PlatformAdmin,
    status_filter: Annotated[
        str | None, Query(alias="status", pattern="^(open|new|in_review|planned|done|declined)$")
    ] = None,
    kind: Annotated[str | None, Query(pattern="^(bug|idea|praise|other|pulse)$")] = None,
    surface: Annotated[str | None, Query(pattern="^(app|portal)$")] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> FeedbackAdminList:
    rows, total = await service.list_feedback(
        db, status_filter=status_filter, kind=kind, surface=surface, q=q, limit=limit, offset=offset
    )
    return FeedbackAdminList(items=[_admin_read(*row) for row in rows], total=total)


@admin_router.get("/summary", response_model=FeedbackSummary)
async def feedback_summary(db: DbSession, _admin: PlatformAdmin) -> dict:
    return await service.summarize(db)


@admin_router.get("/{feedback_id}", response_model=FeedbackAdminRead)
async def get_feedback(feedback_id: uuid.UUID, db: DbSession, _admin: PlatformAdmin) -> FeedbackAdminRead:
    return _admin_read(*await service.get_feedback_with_context(db, feedback_id))


@admin_router.patch("/{feedback_id}", response_model=FeedbackAdminRead)
async def update_feedback(
    feedback_id: uuid.UUID, db: DbSession, admin: PlatformAdmin, data: FeedbackAdminUpdate
) -> FeedbackAdminRead:
    return _admin_read(*await service.update_feedback(db, feedback_id, data, actor=admin))

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.activity import service
from binx_api.modules.activity.schemas import ActivityLogListRead, ActivityLogRead
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency

router = APIRouter(tags=["activity"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]

_ADMIN_ROLES = (ROLE_OWNER, ROLE_ADMIN)


@router.get("/agencies/{agency_id}/activity", response_model=ActivityLogListRead)
async def list_agency_activity(
    db: DbSession,
    agency_id: uuid.UUID,
    agency_and_role: AnyMember,
    category: str | None = Query(default=None, pattern="^(team|clients|projects|invoicing|settings)$"),
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ActivityLogListRead:
    _agency, role = agency_and_role
    rows = await service.list_agency_activity(
        db,
        agency_id,
        viewer_is_admin=role in _ADMIN_ROLES,
        category=category,
        limit=limit + 1,
        offset=offset,
    )
    return ActivityLogListRead(
        items=[ActivityLogRead.model_validate(row) for row in rows[:limit]],
        has_more=len(rows) > limit,
    )


@router.get("/activity/me", response_model=ActivityLogListRead)
async def list_my_account_activity(
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ActivityLogListRead:
    rows = await service.list_account_activity(db, current_user, limit=limit + 1, offset=offset)
    return ActivityLogListRead(
        items=[ActivityLogRead.model_validate(row) for row in rows[:limit]],
        has_more=len(rows) > limit,
    )

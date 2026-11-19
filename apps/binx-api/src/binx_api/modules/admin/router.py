import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from binx_api.core.dependencies import DbSession, require_role
from binx_api.modules.admin import service, support
from binx_api.modules.admin.models import TARGET_AGENCY, TARGET_USER, AdminAuditLog
from binx_api.modules.admin.schemas import (
    AdminActionResult,
    AdminAgencyDetail,
    AdminAgencyPage,
    AdminNoteCreate,
    AdminSearchResult,
    AdminUserDetail,
    AdminUserPage,
    AuditEntryRead,
    AuditPage,
    DeactivateRequest,
    PlatformOverview,
    RoleChange,
    TrialGrant,
)
from binx_api.modules.users.models import ROLE_ADMIN, User

# The Binx team's console — platform admins only (the global User.role, not
# an agency role). The feedback inbox lives alongside it at /admin/feedback
# (modules/feedback/router.py::admin_router).
router = APIRouter(prefix="/admin", tags=["admin"])
PlatformAdmin = Annotated[User, Depends(require_role(ROLE_ADMIN))]

Search = Annotated[str | None, Query(max_length=200)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.get("/overview", response_model=PlatformOverview)
async def platform_overview(db: DbSession, _admin: PlatformAdmin) -> dict:
    return await service.platform_overview(db)


@router.get("/search", response_model=AdminSearchResult)
async def quick_search(
    db: DbSession, _admin: PlatformAdmin, q: Annotated[str, Query(min_length=1, max_length=200)]
) -> dict:
    return await support.quick_search(db, q)


@router.get("/audit", response_model=AuditPage)
async def list_audit(
    db: DbSession,
    _admin: PlatformAdmin,
    target_type: Annotated[str | None, Query(pattern="^(user|agency)$")] = None,
    target_id: uuid.UUID | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> dict:
    items, total = await support.list_audit(
        db, target_type=target_type, target_id=target_id, limit=limit, offset=offset
    )
    return {"items": items, "total": total}


# --- Agencies --------------------------------------------------------------


@router.get("/agencies", response_model=AdminAgencyPage)
async def list_agencies(
    db: DbSession,
    _admin: PlatformAdmin,
    q: Search = None,
    plan: Annotated[str | None, Query(pattern="^(free|starter|pro|scale)$")] = None,
    trialing: bool | None = None,
    limit: Limit = 25,
    offset: Offset = 0,
) -> dict:
    items, total = await support.search_agencies(db, q=q, plan=plan, trialing=trialing, limit=limit, offset=offset)
    return {"items": items, "total": total}


@router.get("/agencies/{agency_id}", response_model=AdminAgencyDetail)
async def get_agency(agency_id: uuid.UUID, db: DbSession, _admin: PlatformAdmin) -> dict:
    return await support.agency_detail(db, agency_id)


@router.post("/agencies/{agency_id}/trial", response_model=AdminActionResult)
async def grant_trial(agency_id: uuid.UUID, db: DbSession, admin: PlatformAdmin, data: TrialGrant) -> dict:
    message = await support.grant_trial(db, agency_id, plan=data.plan, days=data.days, reason=data.reason, actor=admin)
    return {"message": message}


@router.post("/agencies/{agency_id}/trial/end", response_model=AdminActionResult)
async def end_trial(agency_id: uuid.UUID, db: DbSession, admin: PlatformAdmin) -> dict:
    return {"message": await support.end_trial(db, agency_id, actor=admin)}


@router.post("/agencies/{agency_id}/notes", response_model=AuditEntryRead, status_code=status.HTTP_201_CREATED)
async def note_agency(
    agency_id: uuid.UUID, db: DbSession, admin: PlatformAdmin, data: AdminNoteCreate
) -> AdminAuditLog:
    return await support.add_note(db, target_type=TARGET_AGENCY, target_id=agency_id, body=data.body, actor=admin)


# --- Users -----------------------------------------------------------------


@router.get("/users", response_model=AdminUserPage)
async def list_users(
    db: DbSession,
    _admin: PlatformAdmin,
    q: Search = None,
    filter_: Annotated[
        str | None, Query(alias="filter", pattern="^(active|inactive|unverified|admin|staff|portal)$")
    ] = None,
    limit: Limit = 25,
    offset: Offset = 0,
) -> dict:
    items, total = await support.search_users(db, q=q, filter_=filter_, limit=limit, offset=offset)
    return {"items": items, "total": total}


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user(user_id: uuid.UUID, db: DbSession, _admin: PlatformAdmin) -> dict:
    return await support.user_detail(db, user_id)


@router.post("/users/{user_id}/password-reset", response_model=AdminActionResult)
async def send_password_reset(user_id: uuid.UUID, db: DbSession, admin: PlatformAdmin) -> dict:
    return {"message": await support.send_password_reset(db, user_id, actor=admin)}


@router.post("/users/{user_id}/resend-verification", response_model=AdminActionResult)
async def resend_verification(user_id: uuid.UUID, db: DbSession, admin: PlatformAdmin) -> dict:
    return {"message": await support.resend_verification(db, user_id, actor=admin)}


@router.post("/users/{user_id}/verify", response_model=AdminActionResult)
async def mark_verified(user_id: uuid.UUID, db: DbSession, admin: PlatformAdmin) -> dict:
    return {"message": await support.mark_verified(db, user_id, actor=admin)}


@router.post("/users/{user_id}/sign-out", response_model=AdminActionResult)
async def sign_out_everywhere(user_id: uuid.UUID, db: DbSession, admin: PlatformAdmin) -> dict:
    return {"message": await support.sign_out_everywhere(db, user_id, actor=admin)}


@router.post("/users/{user_id}/deactivate", response_model=AdminActionResult)
async def deactivate_user(user_id: uuid.UUID, db: DbSession, admin: PlatformAdmin, data: DeactivateRequest) -> dict:
    return {"message": await support.set_active(db, user_id, active=False, reason=data.reason, actor=admin)}


@router.post("/users/{user_id}/reactivate", response_model=AdminActionResult)
async def reactivate_user(user_id: uuid.UUID, db: DbSession, admin: PlatformAdmin) -> dict:
    return {"message": await support.set_active(db, user_id, active=True, reason=None, actor=admin)}


@router.put("/users/{user_id}/role", response_model=AdminActionResult)
async def set_role(user_id: uuid.UUID, db: DbSession, admin: PlatformAdmin, data: RoleChange) -> dict:
    return {"message": await support.set_role(db, user_id, role=data.role, actor=admin)}


@router.post("/users/{user_id}/notes", response_model=AuditEntryRead, status_code=status.HTTP_201_CREATED)
async def note_user(user_id: uuid.UUID, db: DbSession, admin: PlatformAdmin, data: AdminNoteCreate) -> AdminAuditLog:
    return await support.add_note(db, target_type=TARGET_USER, target_id=user_id, body=data.body, actor=admin)

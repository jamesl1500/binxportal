import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials

from binx_api.core.dependencies import DbSession, bearer_scheme, require_role
from binx_api.core.errors import new_reference
from binx_api.core.rate_limit import limiter
from binx_api.core.security import decode_access_token
from binx_api.modules.errors import service, store
from binx_api.modules.errors.models import ErrorIssue
from binx_api.modules.errors.schemas import (
    ErrorBadge,
    ErrorIssueDetail,
    ErrorIssuePage,
    ErrorIssueStatusRead,
    ErrorIssueStatusUpdate,
    ErrorLookup,
    ErrorSummary,
    WebErrorReceipt,
    WebErrorReport,
)
from binx_api.modules.users.models import ROLE_ADMIN, User

# binx-web reporting its own errors. Open to everyone (a crash on the
# sign-in page matters as much as one in the app) and rate-limited per IP.
router = APIRouter(prefix="/errors", tags=["errors"])

# The Binx team's error dashboard. Platform admins only.
admin_router = APIRouter(prefix="/admin/errors", tags=["errors-admin"])
PlatformAdmin = Annotated[User, Depends(require_role(ROLE_ADMIN))]


def _optional_user_id(credentials: HTTPAuthorizationCredentials | None) -> uuid.UUID | None:
    """Who was signed in, if a valid token came along. A signature check
    only, no database read. It's attribution, not access control, and a
    missing or bad token must never stop the report itself."""
    if credentials is None:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        return None
    try:
        return uuid.UUID(str(payload.get("sub")))
    except ValueError:
        return None


@router.post("/report", response_model=WebErrorReceipt, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("30/minute")
async def report_web_error(
    request: Request,  # noqa: ARG001 - slowapi keys the limit on it
    data: WebErrorReport,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict:
    event_id = uuid.uuid4()
    reference = new_reference(event_id)
    stored = await store.record_web_report(
        data, event_id=event_id, reference=reference, user_id=_optional_user_id(credentials)
    )
    return {"reference": reference if stored else None}


# --- Admin ----------------------------------------------------------------------------


@admin_router.get("/summary", response_model=ErrorSummary)
async def error_summary(db: DbSession, _admin: PlatformAdmin) -> dict:
    return await service.summary(db)


@admin_router.get("/badge", response_model=ErrorBadge)
async def error_badge(db: DbSession, _admin: PlatformAdmin) -> dict:
    return {"open_issues_24h": await service.open_issue_count(db)}


@admin_router.get("/issues", response_model=ErrorIssuePage)
async def list_issues(
    db: DbSession,
    _admin: PlatformAdmin,
    status_: Annotated[str | None, Query(alias="status", pattern="^(unresolved|resolved|ignored)$")] = None,
    source: Annotated[str | None, Query(pattern="^(api|web)$")] = None,
    period: Annotated[str, Query(pattern="^(1h|12h|24h|7d|30d)$")] = "24h",
    sort: Annotated[str, Query(pattern="^(frequent|recent|new)$")] = "frequent",
    q: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    items, total = await service.list_issues(
        db, status_=status_, source=source, period=period, sort=sort, q=q, limit=limit, offset=offset
    )
    return {"items": items, "total": total}


@admin_router.get("/lookup", response_model=ErrorLookup)
async def lookup_reference(
    db: DbSession, _admin: PlatformAdmin, ref: Annotated[str, Query(min_length=1, max_length=64)]
) -> dict:
    return await service.lookup(db, ref)


@admin_router.get("/issues/{issue_id}", response_model=ErrorIssueDetail)
async def get_issue(
    issue_id: uuid.UUID, db: DbSession, _admin: PlatformAdmin, event_id: uuid.UUID | None = None
) -> dict:
    return await service.issue_detail(db, issue_id, event_id=event_id)


@admin_router.patch("/issues/{issue_id}", response_model=ErrorIssueStatusRead)
async def update_issue_status(
    issue_id: uuid.UUID, db: DbSession, admin: PlatformAdmin, data: ErrorIssueStatusUpdate
) -> ErrorIssue:
    return await service.set_status(db, issue_id, new_status=data.status, actor=admin)

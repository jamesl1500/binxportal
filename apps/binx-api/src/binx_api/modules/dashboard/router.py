from typing import Annotated

from fastapi import APIRouter, Depends

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.dashboard import service
from binx_api.modules.dashboard.schemas import DashboardRead, MyWorkRead

router = APIRouter(prefix="/agencies/{agency_id}", tags=["dashboard"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
_ADMIN_ROLES = (ROLE_OWNER, ROLE_ADMIN)


@router.get("/dashboard", response_model=DashboardRead)
async def dashboard_overview(db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember) -> DashboardRead:
    agency, role = agency_and_role
    return await service.overview(db, agency, current_user, viewer_is_admin=role in _ADMIN_ROLES)


@router.get("/my-work", response_model=MyWorkRead)
async def my_work(db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember) -> MyWorkRead:
    agency, _role = agency_and_role
    return await service.my_work(db, agency.id, current_user.id)

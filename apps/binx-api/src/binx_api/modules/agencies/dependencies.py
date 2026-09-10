import uuid

from fastapi import HTTPException, status
from sqlalchemy import select

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.models import Agency, AgencyMember


def require_agency_role(*roles: str):
    """Dependency factory: use as Depends(require_agency_role(ROLE_OWNER)) on an
    endpoint with an `agency_id` path parameter. Gates by the caller's role within
    THAT specific agency — distinct from their global User.role (core/dependencies.py).

    Returns (agency, role) so handlers don't need a second query to get either.
    A caller with no membership row gets 404 rather than 403, so an agency's mere
    existence isn't revealed to someone who isn't part of it.
    """

    async def dependency(agency_id: uuid.UUID, db: DbSession, current_user: CurrentUser) -> tuple[Agency, str]:
        result = await db.execute(
            select(Agency, AgencyMember.role)
            .join(AgencyMember, AgencyMember.agency_id == Agency.id)
            .where(AgencyMember.agency_id == agency_id, AgencyMember.user_id == current_user.id)
        )
        row = result.one_or_none()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Agency not found")

        agency, role = row
        if role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions for this agency")
        return agency, role

    return dependency

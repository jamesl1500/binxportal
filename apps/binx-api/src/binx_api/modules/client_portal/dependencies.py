from typing import Annotated

from fastapi import Depends, HTTPException, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.models import Agency, AgencyClient
from binx_api.modules.client_portal import service
from binx_api.modules.client_portal.models import ClientContact

# What require_client_contact resolves to: the caller's active portal
# membership. The skeleton is single-client-per-session — it picks the first
# ClientContact; /portal/context returns the full list for a future switcher.
PortalMembership = tuple[Agency, AgencyClient, ClientContact]


async def require_client_contact(db: DbSession, current_user: CurrentUser) -> PortalMembership:
    """Gates every `/portal/*` endpoint. 403 (not 404) for a signed-in user
    who simply isn't a client contact — the portal's existence isn't secret,
    unlike a specific agency's."""
    memberships = await service.get_portal_memberships(db, current_user)
    if not memberships:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has no client portal access")
    return memberships[0]


PortalContext = Annotated[PortalMembership, Depends(require_client_contact)]

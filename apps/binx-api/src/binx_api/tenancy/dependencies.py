from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select

from binx_api.core.dependencies import DbSession
from binx_api.tenancy.models import Tenant


async def get_current_tenant(
    db: DbSession,
    x_tenant_slug: Annotated[str | None, Header()] = None,
) -> Tenant:
    if not x_tenant_slug:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing X-Tenant-Slug header")

    result = await db.execute(select(Tenant).where(Tenant.slug == x_tenant_slug))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown tenant")
    return tenant


CurrentTenant = Annotated[Tenant, Depends(get_current_tenant)]

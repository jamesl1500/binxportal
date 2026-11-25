import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.services import service
from binx_api.modules.services.models import Service
from binx_api.modules.services.schemas import ServiceCreate, ServiceRead, ServiceUpdate

router = APIRouter(prefix="/agencies/{agency_id}/services", tags=["services"])

# Every member reads the catalog (they build proposals and invoices from it);
# only owners and admins set the agency's prices.
AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
OwnerOrAdmin = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


def _read(item: Service) -> ServiceRead:
    return ServiceRead(
        id=item.id,
        agency_id=item.agency_id,
        name=item.name,
        description=item.description,
        pricing_type=item.pricing_type,
        unit_price_cents=item.unit_price_cents,
        default_quantity=item.default_quantity,
        is_archived=item.is_archived,
        created_at=item.created_at,
    )


@router.get("", response_model=list[ServiceRead])
async def list_services(db: DbSession, agency_and_role: AnyMember, include_archived: bool = False) -> list[ServiceRead]:
    agency, _role = agency_and_role
    return [_read(item) for item in await service.list_services(db, agency.id, include_archived=include_archived)]


@router.post("", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
async def create_service(
    db: DbSession, current_user: CurrentUser, agency_and_role: OwnerOrAdmin, data: ServiceCreate
) -> ServiceRead:
    agency, _role = agency_and_role
    return _read(await service.create_service(db, agency.id, data, actor=current_user))


@router.patch("/{service_id}", response_model=ServiceRead)
async def update_service(
    db: DbSession, current_user: CurrentUser, agency_and_role: OwnerOrAdmin, service_id: uuid.UUID, data: ServiceUpdate
) -> ServiceRead:
    agency, _role = agency_and_role
    item = await service.get_service_or_404(db, agency.id, service_id)
    return _read(await service.update_service(db, item, data, actor=current_user))


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(
    db: DbSession, current_user: CurrentUser, agency_and_role: OwnerOrAdmin, service_id: uuid.UUID
) -> None:
    agency, _role = agency_and_role
    item = await service.get_service_or_404(db, agency.id, service_id)
    await service.delete_service(db, item, actor=current_user)

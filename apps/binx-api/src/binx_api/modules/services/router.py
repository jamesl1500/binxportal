import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status

from binx_api.core import storage
from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.services import service
from binx_api.modules.services.models import Service, ServiceAttachment, ServiceCategory
from binx_api.modules.services.schemas import (
    ServiceAttachmentRead,
    ServiceCategoryCreate,
    ServiceCategoryRead,
    ServiceCategoryUpdate,
    ServiceCreate,
    ServiceRead,
    ServiceUpdate,
)

router = APIRouter(prefix="/agencies/{agency_id}/services", tags=["services"])
categories_router = APIRouter(prefix="/agencies/{agency_id}/service-categories", tags=["services"])

# Every member reads the catalog (they build proposals and invoices from it);
# only owners and admins set the agency's prices.
AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
OwnerOrAdmin = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]


def _attachment_read(item: ServiceAttachment) -> ServiceAttachmentRead:
    return ServiceAttachmentRead(
        id=item.id, file_name=item.file_name, mime_type=item.mime_type, size=item.size, created_at=item.created_at
    )


def _read(
    item: Service, *, category_name: str | None = None, attachments: list[ServiceAttachment] | None = None
) -> ServiceRead:
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
        is_starting_price=item.is_starting_price,
        category_id=item.category_id,
        category_name=category_name,
        attachments=[_attachment_read(a) for a in attachments or []],
    )


async def _reads(db: DbSession, items: list[Service]) -> list[ServiceRead]:
    """Services with their category names and files, in two queries in all."""
    names = await service.category_names(db, (item.category_id for item in items))
    files = await service.attachments_by_service(db, [item.id for item in items])
    return [_read(item, category_name=names.get(item.category_id), attachments=files.get(item.id)) for item in items]


async def _one(db: DbSession, item: Service) -> ServiceRead:
    return (await _reads(db, [item]))[0]


@router.get("", response_model=list[ServiceRead])
async def list_services(db: DbSession, agency_and_role: AnyMember, include_archived: bool = False) -> list[ServiceRead]:
    agency, _role = agency_and_role
    return await _reads(db, await service.list_services(db, agency.id, include_archived=include_archived))


@router.post("", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
async def create_service(
    db: DbSession, current_user: CurrentUser, agency_and_role: OwnerOrAdmin, data: ServiceCreate
) -> ServiceRead:
    agency, _role = agency_and_role
    return await _one(db, await service.create_service(db, agency.id, data, actor=current_user))


@router.patch("/{service_id}", response_model=ServiceRead)
async def update_service(
    db: DbSession, current_user: CurrentUser, agency_and_role: OwnerOrAdmin, service_id: uuid.UUID, data: ServiceUpdate
) -> ServiceRead:
    agency, _role = agency_and_role
    item = await service.get_service_or_404(db, agency.id, service_id)
    return await _one(db, await service.update_service(db, item, data, actor=current_user))


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service(
    db: DbSession, current_user: CurrentUser, agency_and_role: OwnerOrAdmin, service_id: uuid.UUID
) -> None:
    agency, _role = agency_and_role
    item = await service.get_service_or_404(db, agency.id, service_id)
    await service.delete_service(db, item, actor=current_user)


# ---- Photos and PDFs ----------------------------------------------------------------


@router.post("/{service_id}/attachments", response_model=ServiceAttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_service_attachment(
    db: DbSession, agency_and_role: OwnerOrAdmin, service_id: uuid.UUID, file: Annotated[UploadFile, File()]
) -> ServiceAttachmentRead:
    agency, _role = agency_and_role
    item = await service.get_service_or_404(db, agency.id, service_id)
    attachment = await service.add_attachment(
        db, item, file_name=file.filename, content=await file.read(), mime_type=file.content_type
    )
    return _attachment_read(attachment)


@router.delete("/{service_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_service_attachment(
    db: DbSession, agency_and_role: OwnerOrAdmin, service_id: uuid.UUID, attachment_id: uuid.UUID
) -> None:
    agency, _role = agency_and_role
    item = await service.get_service_or_404(db, agency.id, service_id)
    await service.remove_attachment(db, await service.get_attachment_or_404(db, item.id, attachment_id))


@router.get("/{service_id}/attachments/{attachment_id}/download")
async def download_service_attachment(
    db: DbSession, agency_and_role: AnyMember, service_id: uuid.UUID, attachment_id: uuid.UUID, inline: bool = False
):
    """``inline`` for showing a photo in the page rather than downloading it."""
    agency, _role = agency_and_role
    item = await service.get_service_or_404(db, agency.id, service_id)
    attachment = await service.get_attachment_or_404(db, item.id, attachment_id)
    return await storage.response(
        attachment.storage_path, media_type=attachment.mime_type, filename=None if inline else attachment.file_name
    )


# ---- Categories ----------------------------------------------------------------------


def _category_read(category: ServiceCategory, count: int) -> ServiceCategoryRead:
    return ServiceCategoryRead(id=category.id, name=category.name, position=category.position, service_count=count)


@categories_router.get("", response_model=list[ServiceCategoryRead])
async def list_categories(db: DbSession, agency_and_role: AnyMember) -> list[ServiceCategoryRead]:
    agency, _role = agency_and_role
    return [_category_read(category, count) for category, count in await service.list_categories(db, agency.id)]


@categories_router.post("", response_model=ServiceCategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(
    db: DbSession, agency_and_role: OwnerOrAdmin, data: ServiceCategoryCreate
) -> ServiceCategoryRead:
    agency, _role = agency_and_role
    return _category_read(await service.create_category(db, agency.id, data.name), 0)


@categories_router.patch("/{category_id}", response_model=ServiceCategoryRead)
async def update_category(
    db: DbSession, agency_and_role: OwnerOrAdmin, category_id: uuid.UUID, data: ServiceCategoryUpdate
) -> ServiceCategoryRead:
    agency, _role = agency_and_role
    category = await service.get_category_or_404(db, agency.id, category_id)
    category = await service.update_category(db, category, name=data.name, position=data.position)
    counts = {c.id: n for c, n in await service.list_categories(db, agency.id)}
    return _category_read(category, counts.get(category.id, 0))


@categories_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(db: DbSession, agency_and_role: OwnerOrAdmin, category_id: uuid.UUID) -> None:
    agency, _role = agency_and_role
    await service.delete_category(db, await service.get_category_or_404(db, agency.id, category_id))

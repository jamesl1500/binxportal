"""Service layer for the agency services catalog.

Also owns ``validate_service_ids``, which the proposal / invoice / recurring
line-item writers call so a line can only point at one of *this* agency's
services.
"""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import storage
from binx_api.core.config import get_settings
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_SETTINGS
from binx_api.modules.services.models import (
    MAX_SERVICE_ATTACHMENTS,
    MAX_SERVICE_CATEGORIES,
    SERVICE_ATTACHMENT_TYPES,
    Service,
    ServiceAttachment,
    ServiceCategory,
)
from binx_api.modules.services.schemas import ServiceCreate, ServiceUpdate
from binx_api.modules.users.models import User

settings = get_settings()


async def get_service_or_404(db: AsyncSession, agency_id: uuid.UUID, service_id: uuid.UUID) -> Service:
    result = await db.execute(select(Service).where(Service.id == service_id, Service.agency_id == agency_id))
    service = result.scalar_one_or_none()
    if service is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Service not found")
    return service


async def list_services(db: AsyncSession, agency_id: uuid.UUID, *, include_archived: bool = False) -> list[Service]:
    query = select(Service).where(Service.agency_id == agency_id)
    if not include_archived:
        query = query.where(Service.is_archived.is_(False))
    query = query.order_by(Service.is_archived, func.lower(Service.name))
    return list((await db.execute(query)).scalars().all())


async def _assert_name_free(
    db: AsyncSession, agency_id: uuid.UUID, name: str, *, exclude_id: uuid.UUID | None = None
) -> None:
    """Two active services with the same name would be indistinguishable in
    the picker. Archived ones don't count, so a name can be reused after
    retiring the old service."""
    query = select(Service.id).where(
        Service.agency_id == agency_id,
        Service.is_archived.is_(False),
        func.lower(Service.name) == name.strip().lower(),
    )
    if exclude_id is not None:
        query = query.where(Service.id != exclude_id)
    if (await db.execute(query)).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A service called “{name.strip()}” already exists")


async def create_service(db: AsyncSession, agency_id: uuid.UUID, data: ServiceCreate, *, actor: User) -> Service:
    await _assert_name_free(db, agency_id, data.name)
    if data.category_id is not None:
        await get_category_or_404(db, agency_id, data.category_id)
    service = Service(
        agency_id=agency_id,
        created_by_id=actor.id,
        name=data.name.strip(),
        description=(data.description or "").strip() or None,
        pricing_type=data.pricing_type,
        unit_price_cents=data.unit_price_cents,
        default_quantity=data.default_quantity,
        is_starting_price=data.is_starting_price,
        category_id=data.category_id,
    )
    db.add(service)
    await db.commit()
    await db.refresh(service)
    await activity_service.log_agency_activity(
        db,
        agency_id,
        category=CATEGORY_SETTINGS,
        event_type="service_created",
        summary=f"{actor.full_name} added the service “{service.name}”",
        actor=actor,
        target_type="service",
        target_id=service.id,
        target_name=service.name,
    )
    return service


def _update_event(was_archived: bool, is_archived: bool) -> tuple[str, str]:
    if is_archived == was_archived:
        return "service_updated", "updated"
    return ("service_archived", "archived") if is_archived else ("service_restored", "restored")


def _apply_fields(service: Service, fields: dict) -> None:
    if fields.get("name") is not None:
        service.name = fields["name"].strip()
    if "description" in fields:
        service.description = (fields["description"] or "").strip() or None
    for key in ("pricing_type", "unit_price_cents", "default_quantity", "is_archived", "is_starting_price"):
        if fields.get(key) is not None:
            setattr(service, key, fields[key])
    if "category_id" in fields:
        service.category_id = fields["category_id"]


async def update_service(db: AsyncSession, service: Service, data: ServiceUpdate, *, actor: User) -> Service:
    fields = data.model_dump(exclude_unset=True)
    was_archived = service.is_archived
    will_be_archived = fields["is_archived"] if fields.get("is_archived") is not None else was_archived
    new_name = fields.get("name") or service.name
    # Renaming an active service, or restoring an archived one, can collide
    # with another active service's name.
    renamed = new_name.strip().lower() != service.name.lower()
    if not will_be_archived and (renamed or was_archived):
        await _assert_name_free(db, service.agency_id, new_name, exclude_id=service.id)

    if fields.get("category_id") is not None:
        await get_category_or_404(db, service.agency_id, fields["category_id"])
    _apply_fields(service, fields)
    await db.commit()
    await db.refresh(service)

    event_type, verb = _update_event(was_archived, service.is_archived)
    await activity_service.log_agency_activity(
        db,
        service.agency_id,
        category=CATEGORY_SETTINGS,
        event_type=event_type,
        summary=f"{actor.full_name} {verb} the service “{service.name}”",
        actor=actor,
        target_type="service",
        target_id=service.id,
        target_name=service.name,
    )
    return service


async def delete_service(db: AsyncSession, service: Service, *, actor: User) -> None:
    agency_id, name = service.agency_id, service.name
    paths = [item.storage_path for item in (await attachments_by_service(db, [service.id])).get(service.id, [])]
    await db.delete(service)
    await db.commit()
    for path in paths:
        await storage.delete(path)
    await activity_service.log_agency_activity(
        db,
        agency_id,
        category=CATEGORY_SETTINGS,
        event_type="service_deleted",
        summary=f"{actor.full_name} deleted the service “{name}”",
        actor=actor,
        target_type="service",
        target_name=name,
    )


async def validate_service_ids(db: AsyncSession, agency_id: uuid.UUID, service_ids: Iterable[uuid.UUID | None]) -> None:
    """422 unless every non-null id is one of this agency's services.

    Archived services are accepted: re-saving a draft that used a service
    archived since shouldn't fail.
    """
    wanted = {sid for sid in service_ids if sid is not None}
    if not wanted:
        return
    result = await db.execute(select(Service.id).where(Service.agency_id == agency_id, Service.id.in_(wanted)))
    found = set(result.scalars().all())
    if found != wanted:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A line item refers to an unknown service")


# ---- Categories ------------------------------------------------------------------


async def get_category_or_404(db: AsyncSession, agency_id: uuid.UUID, category_id: uuid.UUID) -> ServiceCategory:
    category = await db.scalar(
        select(ServiceCategory).where(ServiceCategory.id == category_id, ServiceCategory.agency_id == agency_id)
    )
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    return category


async def list_categories(db: AsyncSession, agency_id: uuid.UUID) -> list[tuple[ServiceCategory, int]]:
    """Each category with how many services are in it, in display order."""
    counts = (
        select(Service.category_id, func.count().label("n"))
        .where(Service.agency_id == agency_id, Service.category_id.is_not(None))
        .group_by(Service.category_id)
        .subquery()
    )
    rows = await db.execute(
        select(ServiceCategory, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.category_id == ServiceCategory.id)
        .where(ServiceCategory.agency_id == agency_id)
        .order_by(ServiceCategory.position, func.lower(ServiceCategory.name))
    )
    return [(category, count) for category, count in rows.all()]


async def category_names(db: AsyncSession, category_ids: Iterable[uuid.UUID | None]) -> dict[uuid.UUID, str]:
    wanted = {cid for cid in category_ids if cid is not None}
    if not wanted:
        return {}
    rows = await db.execute(select(ServiceCategory.id, ServiceCategory.name).where(ServiceCategory.id.in_(wanted)))
    return {row[0]: row[1] for row in rows.all()}


async def _assert_category_name_free(
    db: AsyncSession, agency_id: uuid.UUID, name: str, *, exclude_id: uuid.UUID | None = None
) -> None:
    query = select(ServiceCategory.id).where(
        ServiceCategory.agency_id == agency_id, func.lower(ServiceCategory.name) == name.strip().lower()
    )
    if exclude_id is not None:
        query = query.where(ServiceCategory.id != exclude_id)
    if (await db.execute(query)).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"There's already a category called “{name.strip()}”")


async def create_category(db: AsyncSession, agency_id: uuid.UUID, name: str) -> ServiceCategory:
    count = await db.scalar(select(func.count()).where(ServiceCategory.agency_id == agency_id)) or 0
    if count >= MAX_SERVICE_CATEGORIES:
        raise HTTPException(status.HTTP_409_CONFLICT, f"An agency can have up to {MAX_SERVICE_CATEGORIES} categories")
    await _assert_category_name_free(db, agency_id, name)
    category = ServiceCategory(agency_id=agency_id, name=name.strip(), position=count)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def get_or_create_category(db: AsyncSession, agency_id: uuid.UUID, name: str) -> ServiceCategory:
    """For imports: the category with this name (any case), made if new."""
    existing = await db.scalar(
        select(ServiceCategory).where(
            ServiceCategory.agency_id == agency_id, func.lower(ServiceCategory.name) == name.strip().lower()
        )
    )
    return existing or await create_category(db, agency_id, name)


async def update_category(
    db: AsyncSession, category: ServiceCategory, *, name: str | None, position: int | None
) -> ServiceCategory:
    if name is not None and name.strip().lower() != category.name.lower():
        await _assert_category_name_free(db, category.agency_id, name, exclude_id=category.id)
    if name is not None:
        category.name = name.strip()
    if position is not None:
        category.position = position
    await db.commit()
    await db.refresh(category)
    return category


async def delete_category(db: AsyncSession, category: ServiceCategory) -> None:
    """Its services stay, uncategorised (the foreign key sets them to null)."""
    await db.delete(category)
    await db.commit()


# ---- Photos and PDFs ----------------------------------------------------------------


async def attachments_by_service(
    db: AsyncSession, service_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[ServiceAttachment]]:
    """Every listed service's files, in one query."""
    if not service_ids:
        return {}
    rows = await db.execute(
        select(ServiceAttachment)
        .where(ServiceAttachment.service_id.in_(service_ids))
        .order_by(ServiceAttachment.position, ServiceAttachment.created_at)
    )
    grouped: dict[uuid.UUID, list[ServiceAttachment]] = {}
    for item in rows.scalars():
        grouped.setdefault(item.service_id, []).append(item)
    return grouped


async def get_attachment_or_404(db: AsyncSession, service_id: uuid.UUID, attachment_id: uuid.UUID) -> ServiceAttachment:
    item = await db.scalar(
        select(ServiceAttachment).where(
            ServiceAttachment.id == attachment_id, ServiceAttachment.service_id == service_id
        )
    )
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return item


async def add_attachment(
    db: AsyncSession, service: Service, *, file_name: str | None, content: bytes, mime_type: str | None
) -> ServiceAttachment:
    """A photo (JPEG, PNG, WebP, GIF) or PDF, up to the proposal upload size."""
    from binx_api.modules.proposals.service import _clean_file_name, _resolve_mime

    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That file is empty")
    if len(content) > settings.proposal_upload_max_bytes:
        max_mb = settings.proposal_upload_max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Files must be {max_mb}MB or smaller")
    name = _clean_file_name(file_name)
    resolved = _resolve_mime(name, mime_type)
    if resolved not in SERVICE_ATTACHMENT_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Add photos (JPEG, PNG, WebP or GIF) or PDFs to a service"
        )
    count = await db.scalar(select(func.count()).where(ServiceAttachment.service_id == service.id)) or 0
    if count >= MAX_SERVICE_ATTACHMENTS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"A service can have up to {MAX_SERVICE_ATTACHMENTS} files")
    path = await storage.save(
        "agencies", f"{service.agency_id}/services/{service.id}/{uuid.uuid4().hex}", content, content_type=resolved
    )
    item = ServiceAttachment(
        service_id=service.id,
        position=count,
        file_name=name,
        storage_path=path,
        mime_type=resolved,
        size=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def remove_attachment(db: AsyncSession, item: ServiceAttachment) -> None:
    path = item.storage_path
    await db.delete(item)
    await db.commit()
    await storage.delete(path)

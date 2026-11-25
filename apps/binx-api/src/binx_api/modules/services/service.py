"""Service layer for the agency services catalog.

Also owns ``validate_service_ids``, which the proposal / invoice / recurring
line-item writers call so a line can only point at one of *this* agency's
services.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_SETTINGS
from binx_api.modules.services.models import Service
from binx_api.modules.services.schemas import ServiceCreate, ServiceUpdate
from binx_api.modules.users.models import User


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
    service = Service(
        agency_id=agency_id,
        created_by_id=actor.id,
        name=data.name.strip(),
        description=(data.description or "").strip() or None,
        pricing_type=data.pricing_type,
        unit_price_cents=data.unit_price_cents,
        default_quantity=data.default_quantity,
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
    for key in ("pricing_type", "unit_price_cents", "default_quantity", "is_archived"):
        if fields.get(key) is not None:
            setattr(service, key, fields[key])


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
    await db.delete(service)
    await db.commit()
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

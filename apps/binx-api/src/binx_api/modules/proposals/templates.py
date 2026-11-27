"""Proposal templates: saved starting points for new proposals.

A template holds a proposal's terms (``schemas.ProposalTemplateData``: the
title, scope, lines, packages and add-ons, tax, what accepting it does, how
long it stays open) and its documents. Staff save one from any proposal or
build one directly, then start new proposals from it: the editor is
prefilled from the template, and creating the proposal copies the
template's documents onto it. A proposal made from a template is an
independent copy; editing the template later never changes it.

References that can go stale (a catalog service or kickoff questionnaire
deleted since) are dropped when the template is read, so starting from an
old template never fails on them.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import storage
from binx_api.core.config import get_settings
from binx_api.modules.agencies.models import Agency
from binx_api.modules.proposals import options
from binx_api.modules.proposals.models import (
    BILLING_MONTHLY,
    MAX_PROPOSAL_ATTACHMENTS,
    MAX_PROPOSAL_TEMPLATES,
    Proposal,
    ProposalAttachment,
    ProposalTemplate,
    ProposalTemplateAttachment,
)
from binx_api.modules.proposals.schemas import (
    ProposalLineItemInput,
    ProposalPackageInput,
    ProposalTemplateData,
)
from binx_api.modules.services import service as services_service
from binx_api.modules.services.models import Service
from binx_api.modules.users.models import User

settings = get_settings()


def _prefix(agency_id: uuid.UUID, template_id: uuid.UUID) -> str:
    return f"{agency_id}/proposal-templates/{template_id}"


# ---- Reading ------------------------------------------------------------------


async def list_templates(db: AsyncSession, agency_id: uuid.UUID) -> list[ProposalTemplate]:
    result = await db.execute(
        select(ProposalTemplate)
        .where(ProposalTemplate.agency_id == agency_id)
        .order_by(ProposalTemplate.last_used_at.desc().nulls_last(), ProposalTemplate.name)
    )
    return list(result.scalars().all())


async def get_template_or_404(db: AsyncSession, agency_id: uuid.UUID, template_id: uuid.UUID) -> ProposalTemplate:
    template = await db.scalar(
        select(ProposalTemplate).where(ProposalTemplate.id == template_id, ProposalTemplate.agency_id == agency_id)
    )
    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Template not found")
    return template


async def list_attachments(db: AsyncSession, template_id: uuid.UUID) -> list[ProposalTemplateAttachment]:
    result = await db.execute(
        select(ProposalTemplateAttachment)
        .where(ProposalTemplateAttachment.template_id == template_id)
        .order_by(ProposalTemplateAttachment.position, ProposalTemplateAttachment.created_at)
    )
    return list(result.scalars().all())


async def attachment_counts(db: AsyncSession, template_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not template_ids:
        return {}
    rows = await db.execute(
        select(ProposalTemplateAttachment.template_id, func.count())
        .where(ProposalTemplateAttachment.template_id.in_(template_ids))
        .group_by(ProposalTemplateAttachment.template_id)
    )
    return {row[0]: row[1] for row in rows.all()}


def parse(template: ProposalTemplate) -> ProposalTemplateData:
    return ProposalTemplateData.model_validate_json(template.data)


async def _live_ids(db: AsyncSession, column, agency_column, agency_id: uuid.UUID, ids: set) -> set:
    if not ids:
        return set()
    return set((await db.execute(select(column).where(agency_column == agency_id, column.in_(ids)))).scalars())


async def without_stale_references(
    db: AsyncSession, agency_id: uuid.UUID, items: list[ProposalTemplateData]
) -> list[ProposalTemplateData]:
    """Drops services and kickoff questionnaires deleted since the templates
    were saved (one query each for the whole list)."""
    from binx_api.modules.kickoffs.models import KickoffTemplate

    service_ids = {line.service_id for data in items for line in data.line_items if line.service_id}
    kickoff_ids = {data.kickoff_template_id for data in items if data.kickoff_template_id}
    live_services = await _live_ids(db, Service.id, Service.agency_id, agency_id, service_ids)
    live_kickoffs = await _live_ids(db, KickoffTemplate.id, KickoffTemplate.agency_id, agency_id, kickoff_ids)

    def keep(line: ProposalLineItemInput) -> ProposalLineItemInput:
        if line.service_id is None or line.service_id in live_services:
            return line
        return line.model_copy(update={"service_id": None})

    return [
        data.model_copy(
            update={
                "line_items": [keep(line) for line in data.line_items],
                "kickoff_template_id": data.kickoff_template_id if data.kickoff_template_id in live_kickoffs else None,
            }
        )
        for data in items
    ]


def _round(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def starting_totals(data: ProposalTemplateData) -> tuple[int, int]:
    """(one-time total, monthly total), with tax, for the choice a proposal
    made from it starts on: the recommended package (else the first) and
    the pre-selected add-ons. Same rules as options.is_included."""
    starting = next((p.key for p in data.packages if p.recommended), data.packages[0].key if data.packages else None)
    one_time = monthly = 0
    for line in data.line_items:
        if line.package_key not in (None, starting) or (line.optional and not line.selected):
            continue
        amount = _round(Decimal(line.quantity) * Decimal(line.unit_price_cents))
        if line.billing == BILLING_MONTHLY:
            monthly += amount
        else:
            one_time += amount

    def with_tax(cents: int) -> int:
        return cents + _round(Decimal(cents) * data.tax_rate_percent / Decimal(100))

    return with_tax(one_time), with_tax(monthly)


# ---- Writing ------------------------------------------------------------------


async def _check_references(db: AsyncSession, agency_id: uuid.UUID, data: ProposalTemplateData) -> None:
    await services_service.validate_service_ids(db, agency_id, (line.service_id for line in data.line_items))
    if data.kickoff_template_id is not None:
        from binx_api.modules.kickoffs import service as kickoffs_service

        await kickoffs_service.get_template_or_404(db, agency_id, data.kickoff_template_id)


async def _check_room(db: AsyncSession, agency_id: uuid.UUID) -> None:
    count = await db.scalar(select(func.count()).where(ProposalTemplate.agency_id == agency_id))
    if (count or 0) >= MAX_PROPOSAL_TEMPLATES:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"An agency can keep up to {MAX_PROPOSAL_TEMPLATES} proposal templates"
        )


def _clean(name: str, description: str | None) -> tuple[str, str | None]:
    return name.strip(), (description or "").strip() or None


async def create_template(
    db: AsyncSession,
    agency: Agency,
    *,
    created_by: User,
    name: str,
    description: str | None,
    data: ProposalTemplateData,
) -> ProposalTemplate:
    await _check_room(db, agency.id)
    await _check_references(db, agency.id, data)
    name, description = _clean(name, description)
    template = ProposalTemplate(
        agency_id=agency.id,
        created_by_id=created_by.id,
        name=name,
        description=description,
        data=data.model_dump_json(),
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def update_template(
    db: AsyncSession, template: ProposalTemplate, *, name: str, description: str | None, data: ProposalTemplateData
) -> ProposalTemplate:
    await _check_references(db, template.agency_id, data)
    template.name, template.description = _clean(name, description)
    template.data = data.model_dump_json()
    await db.commit()
    await db.refresh(template)
    return template


async def delete_template(db: AsyncSession, template: ProposalTemplate) -> None:
    paths = [item.storage_path for item in await list_attachments(db, template.id)]
    await db.delete(template)
    await db.commit()
    for path in paths:
        await storage.delete(path)


# ---- Documents -----------------------------------------------------------------


async def _attachment_count(db: AsyncSession, template_id: uuid.UUID) -> int:
    return (await db.scalar(select(func.count()).where(ProposalTemplateAttachment.template_id == template_id))) or 0


async def add_attachment(
    db: AsyncSession, template: ProposalTemplate, *, file_name: str | None, content: bytes, mime_type: str | None
) -> ProposalTemplateAttachment:
    """Same rules as a proposal's documents (service.add_attachment)."""
    from binx_api.modules.proposals.service import _clean_file_name, _resolve_mime

    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That file is empty")
    if len(content) > settings.proposal_upload_max_bytes:
        max_mb = settings.proposal_upload_max_bytes // (1024 * 1024)
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"Files must be {max_mb}MB or smaller")
    count = await _attachment_count(db, template.id)
    if count >= MAX_PROPOSAL_ATTACHMENTS:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A template can have at most {MAX_PROPOSAL_ATTACHMENTS} attachments"
        )
    name = _clean_file_name(file_name)
    resolved = _resolve_mime(name, mime_type)
    path = await storage.save(
        "agencies", f"{_prefix(template.agency_id, template.id)}/{uuid.uuid4().hex}", content, content_type=resolved
    )
    attachment = ProposalTemplateAttachment(
        template_id=template.id,
        position=count,
        file_name=name,
        storage_path=path,
        mime_type=resolved,
        size=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


async def get_attachment_or_404(
    db: AsyncSession, template_id: uuid.UUID, attachment_id: uuid.UUID
) -> ProposalTemplateAttachment:
    attachment = await db.scalar(
        select(ProposalTemplateAttachment).where(
            ProposalTemplateAttachment.id == attachment_id, ProposalTemplateAttachment.template_id == template_id
        )
    )
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    return attachment


async def remove_attachment(db: AsyncSession, attachment: ProposalTemplateAttachment) -> None:
    path = attachment.storage_path
    await db.delete(attachment)
    await db.commit()
    await storage.delete(path)


# ---- From a proposal, and onto one ------------------------------------------------


def _valid_for_days(proposal: Proposal) -> int | None:
    if proposal.valid_until is None:
        return None
    start = proposal.sent_at or proposal.created_at or datetime.now(UTC)
    return min(max((proposal.valid_until - start).days, 1), 365)


async def data_from_proposal(db: AsyncSession, proposal: Proposal) -> ProposalTemplateData:
    """The proposal's terms as template contents. Package keys are the
    packages' ids; add-ons keep whether they start ticked."""
    lines = await options.list_lines(db, proposal.id)
    packages = await options.list_packages(db, proposal.id)
    return ProposalTemplateData(
        title=proposal.title,
        content=proposal.content,
        currency=proposal.currency,
        tax_rate_percent=proposal.tax_rate_percent,
        valid_for_days=_valid_for_days(proposal),
        line_items=[
            ProposalLineItemInput(
                description=line.description,
                details=line.details,
                quantity=line.quantity,
                unit_price_cents=line.unit_price_cents,
                service_id=line.service_id,
                billing=line.billing,
                package_key=str(line.package_id) if line.package_id else None,
                optional=line.optional,
                selected=line.selected,
            )
            for line in lines
        ],
        packages=[
            ProposalPackageInput(
                key=str(package.id),
                name=package.name,
                description=package.description,
                recommended=package.recommended,
            )
            for package in packages
        ],
        requires_countersign=proposal.requires_countersign,
        require_email_code=proposal.require_email_code,
        deposit_percent=proposal.deposit_percent,
        create_project_on_accept=proposal.create_project_on_accept,
        kickoff_template_id=proposal.kickoff_template_id,
    )


async def save_proposal_as_template(
    db: AsyncSession, proposal: Proposal, agency: Agency, *, created_by: User, name: str, description: str | None
) -> ProposalTemplate:
    """A new template from a proposal (any status), with copies of its documents."""
    data = await data_from_proposal(db, proposal)
    template = await create_template(db, agency, created_by=created_by, name=name, description=description, data=data)
    from binx_api.modules.proposals.service import list_attachments as list_proposal_attachments

    for position, item in enumerate(await list_proposal_attachments(db, proposal.id)):
        path = await storage.copy(
            item.storage_path, "agencies", f"{_prefix(agency.id, template.id)}/{uuid.uuid4().hex}"
        )
        db.add(
            ProposalTemplateAttachment(
                template_id=template.id,
                position=position,
                file_name=item.file_name,
                storage_path=path,
                mime_type=item.mime_type,
                size=item.size,
                sha256=item.sha256,
            )
        )
    await db.commit()
    return template


async def apply_to_proposal(
    db: AsyncSession, template: ProposalTemplate, proposal: Proposal, *, uploaded_by: User
) -> None:
    """After a proposal is created from the template: copies its documents
    on (up to the proposal's limit) and counts the use."""
    for position, item in enumerate((await list_attachments(db, template.id))[:MAX_PROPOSAL_ATTACHMENTS]):
        path = await storage.copy(
            item.storage_path, "agencies", f"{proposal.agency_id}/proposals/{proposal.id}/{uuid.uuid4().hex}"
        )
        db.add(
            ProposalAttachment(
                proposal_id=proposal.id,
                uploaded_by_id=uploaded_by.id,
                position=position,
                file_name=item.file_name,
                storage_path=path,
                mime_type=item.mime_type,
                size=item.size,
                sha256=item.sha256,
            )
        )
    template.use_count += 1
    template.last_used_at = datetime.now(UTC)
    await db.commit()

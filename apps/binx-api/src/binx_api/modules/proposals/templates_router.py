"""Proposal templates (templates.py): list, build, edit and delete them, and
their documents. Any member of the agency can use and manage them, as with
proposals. Saving a proposal as a template is on the proposals router
(``POST /agencies/{id}/proposals/{id}/save-as-template``), and starting a
proposal from one is ``template_id`` on proposal create."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.proposals import templates
from binx_api.modules.proposals.models import ProposalTemplate, ProposalTemplateAttachment
from binx_api.modules.proposals.router import attachment_download
from binx_api.modules.proposals.schemas import (
    ProposalAttachmentRead,
    ProposalTemplateData,
    ProposalTemplateRead,
    ProposalTemplateSummaryRead,
    ProposalTemplateWrite,
)

router = APIRouter(prefix="/agencies/{agency_id}/proposal-templates", tags=["proposal-templates"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]


def template_attachment_read(item: ProposalTemplateAttachment) -> ProposalAttachmentRead:
    return ProposalAttachmentRead(
        id=item.id,
        file_name=item.file_name,
        mime_type=item.mime_type,
        size=item.size,
        sha256=item.sha256,
        created_at=item.created_at,
    )


def _summary(template: ProposalTemplate, data: ProposalTemplateData, attachment_count: int) -> dict:
    total, monthly = templates.starting_totals(data)
    return {
        "id": template.id,
        "name": template.name,
        "description": template.description,
        "title": data.title,
        "line_count": len(data.line_items),
        "package_names": [package.name for package in data.packages],
        "currency": data.currency,
        "total_cents": total,
        "monthly_total_cents": monthly,
        "attachment_count": attachment_count,
        "use_count": template.use_count,
        "last_used_at": template.last_used_at,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
    }


async def template_read(db: DbSession, template: ProposalTemplate) -> ProposalTemplateRead:
    [data] = await templates.without_stale_references(db, template.agency_id, [templates.parse(template)])
    attachments = await templates.list_attachments(db, template.id)
    return ProposalTemplateRead(
        **_summary(template, data, len(attachments)),
        data=data,
        attachments=[template_attachment_read(item) for item in attachments],
    )


@router.get("", response_model=list[ProposalTemplateSummaryRead])
async def list_templates(db: DbSession, agency_and_role: AnyMember) -> list[ProposalTemplateSummaryRead]:
    agency, _role = agency_and_role
    rows = await templates.list_templates(db, agency.id)
    counts = await templates.attachment_counts(db, [row.id for row in rows])
    # Totals and names don't depend on references, so no stale-reference pass here.
    return [ProposalTemplateSummaryRead(**_summary(row, templates.parse(row), counts.get(row.id, 0))) for row in rows]


@router.post("", response_model=ProposalTemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(
    db: DbSession, current_user: CurrentUser, agency_and_role: AnyMember, data: ProposalTemplateWrite
) -> ProposalTemplateRead:
    agency, _role = agency_and_role
    template = await templates.create_template(
        db, agency, created_by=current_user, name=data.name, description=data.description, data=data.data
    )
    return await template_read(db, template)


@router.get("/{template_id}", response_model=ProposalTemplateRead)
async def read_template(db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID) -> ProposalTemplateRead:
    agency, _role = agency_and_role
    return await template_read(db, await templates.get_template_or_404(db, agency.id, template_id))


@router.put("/{template_id}", response_model=ProposalTemplateRead)
async def update_template(
    db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID, data: ProposalTemplateWrite
) -> ProposalTemplateRead:
    agency, _role = agency_and_role
    template = await templates.get_template_or_404(db, agency.id, template_id)
    template = await templates.update_template(
        db, template, name=data.name, description=data.description, data=data.data
    )
    return await template_read(db, template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID) -> None:
    agency, _role = agency_and_role
    await templates.delete_template(db, await templates.get_template_or_404(db, agency.id, template_id))


@router.post("/{template_id}/attachments", response_model=ProposalAttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_template_attachment(
    db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID, file: Annotated[UploadFile, File()]
) -> ProposalAttachmentRead:
    agency, _role = agency_and_role
    template = await templates.get_template_or_404(db, agency.id, template_id)
    attachment = await templates.add_attachment(
        db, template, file_name=file.filename, content=await file.read(), mime_type=file.content_type
    )
    return template_attachment_read(attachment)


@router.delete("/{template_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_attachment(
    db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID, attachment_id: uuid.UUID
) -> None:
    agency, _role = agency_and_role
    template = await templates.get_template_or_404(db, agency.id, template_id)
    await templates.remove_attachment(db, await templates.get_attachment_or_404(db, template.id, attachment_id))


@router.get("/{template_id}/attachments/{attachment_id}/download")
async def download_template_attachment(
    db: DbSession, agency_and_role: AnyMember, template_id: uuid.UUID, attachment_id: uuid.UUID
):
    agency, _role = agency_and_role
    template = await templates.get_template_or_404(db, agency.id, template_id)
    return await attachment_download(await templates.get_attachment_or_404(db, template.id, attachment_id))

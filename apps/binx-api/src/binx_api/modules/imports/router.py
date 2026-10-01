"""
Bulk import of clients and team invitations from .csv / .xlsx.

Two calls per import, both stateless:
1. ``POST /{kind}/parse`` (multipart) — read the file, return its columns,
   rows, and a suggested column → field mapping. Nothing is stored.
2. ``POST /clients`` or ``POST /team`` (JSON) — the mapped rows, with
   ``dry_run=true`` for the Review step, then ``false`` to import.

Clients can be imported by any member (same as adding one); team invites
only by owners/admins (same as inviting one).
"""

from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile, status

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.core.email import send_agency_invitation_email
from binx_api.core.rate_limit import limiter
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.imports import service
from binx_api.modules.imports.fields import field_reads, suggest_mapping
from binx_api.modules.imports.parsing import ImportFileError, parse_upload
from binx_api.modules.imports.schemas import (
    MAX_CLIENT_ROWS,
    MAX_TEAM_ROWS,
    ClientImportRequest,
    ImportKind,
    ImportParsedRow,
    ImportParseRead,
    ImportResultRead,
    TeamImportRequest,
)

router = APIRouter(prefix="/agencies/{agency_id}/imports", tags=["imports"])

AnyMember = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER))]
AdminOrOwner = Annotated[tuple[Agency, str], Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN))]

# Pause between invite emails so a 100-row import stays under SES's
# per-second sending rate instead of bursting.
_INVITE_EMAIL_INTERVAL_SECONDS = 0.1


@router.post("/{kind}/parse", response_model=ImportParseRead)
@limiter.limit("60/hour")
async def parse_import_file(
    request: Request,
    kind: ImportKind,
    agency_and_role: AnyMember,
    file: Annotated[UploadFile, File()],
) -> ImportParseRead:
    _agency, role = agency_and_role
    if kind == "team" and role == ROLE_MEMBER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only owners and admins can invite people")

    content = await file.read()
    try:
        sheet = parse_upload(
            file.filename or "upload",
            content,
            max_rows=MAX_TEAM_ROWS if kind == "team" else MAX_CLIENT_ROWS,
        )
    except ImportFileError as error:
        raise HTTPException(error.status_code, str(error)) from None

    return ImportParseRead(
        columns=sheet.headers,
        rows=[ImportParsedRow(row=row_number, cells=cells) for row_number, cells in sheet.rows],
        fields=field_reads(kind),
        mapping=suggest_mapping(kind, sheet.headers),
    )


@router.post("/clients", response_model=ImportResultRead)
@limiter.limit("120/hour")
async def import_clients(
    request: Request, db: DbSession, data: ClientImportRequest, current_user: CurrentUser, agency_and_role: AnyMember
) -> ImportResultRead:
    agency, _role = agency_and_role
    return await service.import_clients(db, agency, rows=data.rows, actor=current_user, dry_run=data.dry_run)


async def _send_invite_emails(invites: list[tuple[str, str]], *, agency_name: str, inviter_name: str) -> None:
    for index, (email, token) in enumerate(invites):
        if index:
            await asyncio.sleep(_INVITE_EMAIL_INTERVAL_SECONDS)
        await send_agency_invitation_email(to=email, agency_name=agency_name, inviter_name=inviter_name, token=token)


@router.post("/team", response_model=ImportResultRead)
@limiter.limit("120/hour")
async def import_team(
    request: Request,
    db: DbSession,
    data: TeamImportRequest,
    current_user: CurrentUser,
    agency_and_role: AdminOrOwner,
    background_tasks: BackgroundTasks,
) -> ImportResultRead:
    agency, _role = agency_and_role
    result, invites = await service.import_team(db, agency, rows=data.rows, actor=current_user, dry_run=data.dry_run)
    if invites:
        # After the response: the invites already exist (and are listed on
        # the Team page with a Resend action), so the import shouldn't wait
        # on up to 100 emails going out.
        background_tasks.add_task(
            _send_invite_emails, invites, agency_name=agency.name, inviter_name=current_user.full_name
        )
    return result

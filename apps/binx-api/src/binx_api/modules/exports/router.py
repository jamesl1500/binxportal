"""
CSV / XLSX downloads of an agency's data, plus starter templates for imports.

- ``GET /agencies/{id}/exports/{kind}?format=csv|xlsx`` — everything of that
  kind. Open to any member (each list is already visible to every member in
  the app); admin-only fields are included only for owners/admins. Every
  export is written to the agency's activity log (admin-visible), so there's
  a record of who downloaded what.
- ``GET /agencies/{id}/imports/{kind}/template?format=csv|xlsx`` — the import
  fields' labels as headers plus one example row. Generated from
  imports/fields.py, so a template can never drift from what the importer
  recognizes.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response

from binx_api.core.dependencies import CurrentUser, DbSession
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import (
    CATEGORY_CLIENTS,
    CATEGORY_INVOICING,
    CATEGORY_PROJECTS,
    CATEGORY_PROPOSALS,
    CATEGORY_SETTINGS,
    CATEGORY_TEAM,
    VISIBILITY_ADMIN,
)
from binx_api.modules.agencies.dependencies import require_agency_role
from binx_api.modules.agencies.models import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, Agency
from binx_api.modules.exports.service import EXPORTERS
from binx_api.modules.exports.writer import CSV_MEDIA_TYPE, XLSX_MEDIA_TYPE, render
from binx_api.modules.imports.fields import FIELDS_BY_KIND
from binx_api.modules.imports.schemas import ImportKind

router = APIRouter(prefix="/agencies/{agency_id}", tags=["exports"])

# During a deletion hold only the owner can still export (the Terms promise it).
AnyMember = Annotated[
    tuple[Agency, str],
    Depends(require_agency_role(ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER, during_hold=(ROLE_OWNER,))),
]

ExportKind = Literal[
    "clients", "team", "leads", "projects", "tasks", "time_entries", "invoices", "proposals", "services"
]
FileFormat = Literal["csv", "xlsx"]

_NOUNS: dict[str, str] = {
    "clients": "clients",
    "team": "team members",
    "leads": "leads",
    "projects": "projects",
    "tasks": "tasks",
    "time_entries": "time entries",
    "invoices": "invoices",
    "proposals": "proposals",
    "services": "services",
}
_ACTIVITY_CATEGORY: dict[str, str] = {
    "clients": CATEGORY_CLIENTS,
    "team": CATEGORY_TEAM,
    "leads": CATEGORY_CLIENTS,
    "projects": CATEGORY_PROJECTS,
    "tasks": CATEGORY_PROJECTS,
    "time_entries": CATEGORY_PROJECTS,
    "invoices": CATEGORY_INVOICING,
    "proposals": CATEGORY_PROPOSALS,
    "services": CATEGORY_SETTINGS,
}

# One illustrative row per import template, in FIELDS_BY_KIND order.
_TEMPLATE_EXAMPLES: dict[str, list[str]] = {
    "clients": [
        "Acme Co",
        "Jane Smith",
        "jane@acme.example",
        "555-0100",
        "https://acme.example",
        "Met at the spring expo",
        "billing@acme.example",
        "1 Main St, Springfield",
    ],
    "team": ["sam@youragency.example", "member"],
    "leads": [
        "Northwind Traders",
        "Alex Kim",
        "alex@northwind.example",
        "555-0101",
        "https://northwind.example",
        "15000",
        "new",
        "Referred by Acme",
    ],
    "projects": ["Website redesign", "Acme Co", "active", "New marketing site", "2026-01-05", "2026-03-31", "150"],
    "tasks": ["Website redesign", "Write homepage copy", "To Do", "First draft for review", "2026-01-20", ""],
    "time_entries": ["2026-01-12", "1.5", "Website redesign", "Write homepage copy", "", "Copy draft", "yes", ""],
    "services": ["Design retainer", "Up to 20 hours of design a month", "Monthly", "2000", "1", "Active"],
}


def _file_response(content: bytes, *, file_format: str, file_name: str) -> Response:
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE if file_format == "xlsx" else CSV_MEDIA_TYPE,
        headers={
            "Content-Disposition": f'attachment; filename="{file_name}.{file_format}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/exports/{kind}")
async def export_data(
    db: DbSession,
    kind: ExportKind,
    agency_and_role: AnyMember,
    current_user: CurrentUser,
    file_format: Annotated[FileFormat, Query(alias="format")] = "csv",
) -> Response:
    agency, role = agency_and_role
    table = await EXPORTERS[kind](db, agency.id, viewer_is_admin=role in (ROLE_OWNER, ROLE_ADMIN))
    content = render(table.headers, table.rows, file_format=file_format, sheet_title=table.sheet_title)

    count = len(table.rows)
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=_ACTIVITY_CATEGORY[kind],
        event_type=f"{kind}_exported",
        summary=f"{current_user.full_name} exported {count} {_NOUNS[kind]} ({file_format.upper()})",
        visibility=VISIBILITY_ADMIN,
        actor=current_user,
    )
    stamp = datetime.now(UTC).date().isoformat()
    return _file_response(content, file_format=file_format, file_name=f"{agency.slug}-{kind.replace('_', '-')}-{stamp}")


@router.get("/imports/{kind}/template")
async def import_template(
    kind: ImportKind,
    agency_and_role: AnyMember,
    file_format: Annotated[FileFormat, Query(alias="format")] = "csv",
) -> Response:
    headers = [field.label for field in FIELDS_BY_KIND[kind]]
    content = render(headers, [_TEMPLATE_EXAMPLES[kind]], file_format=file_format, sheet_title="Import")
    return _file_response(content, file_format=file_format, file_name=f"{kind.replace('_', '-')}-import-template")

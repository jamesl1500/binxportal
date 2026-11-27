"""
Bulk imports: validate mapped rows, skip duplicates, import as many as the
plan allows, and report exactly what happened to every row.

The same function serves the Review step (``dry_run=True`` — nothing is
written) and the final import (``dry_run=False``), so what the user reviewed
is what gets imported. Every row is re-validated server-side with the same
schemas the one-at-a-time forms use; the client's view of validity is never
trusted.

Policy (product decisions, see the import feature notes):
- duplicates are skipped, never merged into the existing record;
- over the plan limit → import the first rows that fit, skip the rest;
- team members are *invited* (an account can't be created on someone's
  behalf); the caller emails the returned tokens.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status
from pydantic import ValidationError
from pydantic.networks import validate_email
from pydantic_core import PydanticCustomError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_CLIENTS, CATEGORY_PROJECTS, CATEGORY_SETTINGS, CATEGORY_TEAM
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import (
    INVITATION_PENDING,
    ROLE_ADMIN,
    ROLE_MEMBER,
    ROLE_OWNER,
    Agency,
    AgencyClient,
    AgencyInvitation,
    AgencyMember,
)
from binx_api.modules.agencies.schemas import AgencyClientCreate
from binx_api.modules.billing import service as billing_service
from binx_api.modules.imports.fields import CLIENT_FIELDS, LEAD_FIELDS, PROJECT_FIELDS, SERVICE_FIELDS
from binx_api.modules.imports.schemas import (
    ClientImportRow,
    ImportResultRead,
    ImportRowResult,
    LeadImportRow,
    ProjectImportRow,
    ServiceImportRow,
    TaskImportRow,
    TeamImportRow,
    TimeEntryImportRow,
)
from binx_api.modules.imports.values import (
    parse_bool,
    parse_date,
    parse_duration_minutes,
    parse_money_cents,
    strip_formula_guard,
)
from binx_api.modules.leads.models import EVENT_CREATED as LEAD_EVENT_CREATED
from binx_api.modules.leads.models import LEAD_STATUSES, Lead, LeadEvent
from binx_api.modules.leads.schemas import LeadCreate
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_PROJECTS as NOTIFY_CATEGORY_PROJECTS
from binx_api.modules.notifications.models import EVENT_TASK_ASSIGNED
from binx_api.modules.projects import service as projects_service
from binx_api.modules.projects.models import (
    STATUS_ARCHIVED,
    STATUS_PLANNING,
    Project,
    ProjectTask,
    ProjectTaskList,
    project_statuses,
)
from binx_api.modules.projects.schemas import ProjectCreate
from binx_api.modules.services import service as services_service
from binx_api.modules.services.models import PRICING_FIXED, PRICING_HOURLY, PRICING_MONTHLY, Service
from binx_api.modules.services.schemas import ServiceCreate
from binx_api.modules.time_tracking import service as time_service
from binx_api.modules.time_tracking.models import TimeEntry
from binx_api.modules.users.models import User

_FIELD_LABELS = {field.key: field.label for field in CLIENT_FIELDS}


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = strip_formula_guard(value.strip())
    return value or None


def _validation_message(error: ValidationError, labels: dict[str, str] | None = None) -> str:
    labels = _FIELD_LABELS if labels is None else labels
    parts = []
    for item in error.errors():
        field = str(item["loc"][0]) if item["loc"] else ""
        label = labels.get(field, field.replace("_", " ").capitalize())
        message = item["msg"].removeprefix("Value error, ")
        parts.append(f"{label}: {message}" if label else message)
    return "; ".join(parts)


def _result(
    rows: list[ImportRowResult], *, dry_run: bool, plan_name: str, limit: int | None, remaining: int | None
) -> ImportResultRead:
    def count(status_: str) -> int:
        return sum(1 for row in rows if row.status == status_)

    return ImportResultRead(
        dry_run=dry_run,
        rows=rows,
        imported=count("ok"),
        duplicates=count("duplicate"),
        invalid=count("invalid"),
        over_limit=count("over_limit"),
        plan_name=plan_name,
        limit=limit,
        remaining=remaining,
    )


def _over_limit_message(plan_name: str, limit: int, noun: str) -> str:
    return f"Over your {plan_name} plan's limit of {limit} {noun} — upgrade to import the rest."


# ---- Clients ------------------------------------------------------------


async def import_clients(
    db: AsyncSession, agency: Agency, *, rows: list[ClientImportRow], actor: User, dry_run: bool
) -> ImportResultRead:
    limits = await billing_service.get_plan_limits(db, agency.id)
    active = await db.execute(
        select(func.count())
        .select_from(AgencyClient)
        .where(AgencyClient.agency_id == agency.id, AgencyClient.is_active.is_(True))
    )
    remaining = None if limits.max_clients is None else max(0, limits.max_clients - int(active.scalar_one()))

    # Archived clients count as duplicates too — re-importing one would just
    # create a second copy of a client the agency already has on file.
    existing = await db.execute(
        select(AgencyClient.name, AgencyClient.primary_contact_email).where(AgencyClient.agency_id == agency.id)
    )
    existing_names: set[str] = set()
    existing_emails: set[str] = set()
    for name, email in existing.all():
        existing_names.add(name.casefold())
        if email:
            existing_emails.add(email.casefold())

    seen_names: dict[str, int] = {}
    seen_emails: dict[str, int] = {}
    results: list[ImportRowResult] = []
    to_create: list[AgencyClientCreate] = []

    for row in rows:
        data = {key: _clean(value) for key, value in row.model_dump(exclude={"row"}).items()}
        label = data["name"] or f"Row {row.row}"

        if not data["name"]:
            results.append(
                ImportRowResult(row=row.row, label=label, status="invalid", message="Client name is required")
            )
            continue
        try:
            client = AgencyClientCreate.model_validate(data)
        except ValidationError as error:
            results.append(
                ImportRowResult(row=row.row, label=label, status="invalid", message=_validation_message(error))
            )
            continue

        name_key = client.name.casefold()
        email_key = client.primary_contact_email.casefold() if client.primary_contact_email else None
        duplicate: str | None = None
        if name_key in existing_names:
            duplicate = f"You already have a client named “{client.name}”"
        elif email_key and email_key in existing_emails:
            duplicate = "You already have a client with this contact email"
        elif name_key in seen_names:
            duplicate = f"Same client name as row {seen_names[name_key]}"
        elif email_key and email_key in seen_emails:
            duplicate = f"Same contact email as row {seen_emails[email_key]}"
        if duplicate:
            results.append(ImportRowResult(row=row.row, label=label, status="duplicate", message=duplicate))
            continue
        seen_names[name_key] = row.row
        if email_key:
            seen_emails[email_key] = row.row

        if remaining is not None and len(to_create) >= remaining:
            results.append(
                ImportRowResult(
                    row=row.row,
                    label=label,
                    status="over_limit",
                    message=_over_limit_message(limits.name, limits.max_clients or 0, "clients"),
                )
            )
            continue

        to_create.append(client)
        results.append(ImportRowResult(row=row.row, label=label, status="ok"))

    if not dry_run and to_create:
        slugs = await agencies_service.generate_client_slugs(db, agency.id, [client.name for client in to_create])
        db.add_all(
            AgencyClient(agency_id=agency.id, slug=slug, **client.model_dump())
            for client, slug in zip(to_create, slugs, strict=True)
        )
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Could not import clients, please try again") from None

        count = len(to_create)
        await activity_service.log_agency_activity(
            db,
            agency.id,
            category=CATEGORY_CLIENTS,
            event_type="clients_imported",
            summary=f"{actor.full_name} imported {count} client{'' if count == 1 else 's'}",
            actor=actor,
        )

    return _result(results, dry_run=dry_run, plan_name=limits.name, limit=limits.max_clients, remaining=remaining)


# ---- Team -----------------------------------------------------------------

_ROLE_ALIASES = {
    "": ROLE_MEMBER,
    "member": ROLE_MEMBER,
    "members": ROLE_MEMBER,
    "admin": ROLE_ADMIN,
    "administrator": ROLE_ADMIN,
    "admins": ROLE_ADMIN,
}


async def import_team(
    db: AsyncSession, agency: Agency, *, rows: list[TeamImportRow], actor: User, dry_run: bool
) -> tuple[ImportResultRead, list[tuple[str, str]]]:
    """Returns the result plus (email, raw invite token) for every invitation
    actually created, for the caller to email — tokens are never persisted."""
    limits = await billing_service.get_plan_limits(db, agency.id)
    seats = await agencies_service.count_team_seats(db, agency.id)
    remaining = None if limits.max_team_members is None else max(0, limits.max_team_members - seats)

    member_emails = await db.execute(
        select(User.email)
        .join(AgencyMember, AgencyMember.user_id == User.id)
        .where(AgencyMember.agency_id == agency.id)
    )
    members = {email.casefold() for email in member_emails.scalars().all()}
    pending_emails = await db.execute(
        select(AgencyInvitation.email).where(
            AgencyInvitation.agency_id == agency.id,
            AgencyInvitation.status == INVITATION_PENDING,
            AgencyInvitation.expires_at > func.now(),
        )
    )
    pending = {email.casefold() for email in pending_emails.scalars().all()}

    seen: dict[str, int] = {}
    results: list[ImportRowResult] = []
    to_invite: list[tuple[int, str, str]] = []  # (result index, email, role)

    for row in rows:
        raw_email = _clean(row.email)
        label = raw_email or f"Row {row.row}"
        if not raw_email:
            results.append(ImportRowResult(row=row.row, label=label, status="invalid", message="Email is required"))
            continue
        try:
            # pydantic's own EmailStr validator (EmailStr is a thin wrapper
            # around it) — same normalisation and the same rejections.
            _name, email = validate_email(raw_email)
        except PydanticCustomError:
            results.append(
                ImportRowResult(row=row.row, label=label, status="invalid", message="That isn't a valid email address")
            )
            continue

        role_key = (_clean(row.role) or "").casefold()
        if role_key == ROLE_OWNER:
            results.append(
                ImportRowResult(
                    row=row.row,
                    label=label,
                    status="invalid",
                    message="Owners can't be invited — invite them as admin, then transfer ownership",
                )
            )
            continue
        role = _ROLE_ALIASES.get(role_key)
        if role is None:
            results.append(
                ImportRowResult(row=row.row, label=label, status="invalid", message="Role must be “admin” or “member”")
            )
            continue

        key = email.casefold()
        duplicate: str | None = None
        if key in members:
            duplicate = "Already on your team"
        elif key in pending:
            duplicate = "Already invited"
        elif key in seen:
            duplicate = f"Same email as row {seen[key]}"
        if duplicate:
            results.append(ImportRowResult(row=row.row, label=label, status="duplicate", message=duplicate))
            continue
        seen[key] = row.row

        if remaining is not None and len(to_invite) >= remaining:
            results.append(
                ImportRowResult(
                    row=row.row,
                    label=label,
                    status="over_limit",
                    message=_over_limit_message(limits.name, limits.max_team_members or 0, "team members"),
                )
            )
            continue

        to_invite.append((len(results), email, role))
        results.append(ImportRowResult(row=row.row, label=label, status="ok"))

    tokens: list[tuple[str, str]] = []
    if not dry_run:
        # One invite at a time through the normal path, so the seat check,
        # expired-invite reuse, and token handling stay in one place. A
        # concurrent change (someone else inviting at the same moment) is
        # reported on the affected row instead of failing the whole import.
        for index, email, role in to_invite:
            try:
                _invitation, raw_token = await agencies_service.create_invitation(
                    db, agency, email=email, role=role, invited_by=actor
                )
            except HTTPException as error:
                results[index].status = "over_limit" if error.status_code == 402 else "duplicate"
                results[index].message = str(error.detail)
                continue
            tokens.append((email, raw_token))

        if tokens:
            count = len(tokens)
            await activity_service.log_agency_activity(
                db,
                agency.id,
                category=CATEGORY_TEAM,
                event_type="invitations_imported",
                summary=f"{actor.full_name} invited {count} {'person' if count == 1 else 'people'} from an import",
                actor=actor,
            )

    return (
        _result(results, dry_run=dry_run, plan_name=limits.name, limit=limits.max_team_members, remaining=remaining),
        tokens,
    )


# ---- Shared helpers for the kinds below -------------------------------------


def _invalid(row: int, label: str, message: str) -> ImportRowResult:
    return ImportRowResult(row=row, label=label, status="invalid", message=message)


def _duplicate(row: int, label: str, message: str) -> ImportRowResult:
    return ImportRowResult(row=row, label=label, status="duplicate", message=message)


def _over_limit(row: int, label: str, plan_name: str, limit: int | None, noun: str) -> ImportRowResult:
    message = _over_limit_message(plan_name, limit or 0, noun)
    return ImportRowResult(row=row, label=label, status="over_limit", message=message)


def _typed[T](label: str, parse: Callable[[str], T], value: str | None) -> T | None:
    """Runs a values.py parser on an optional cell, prefixing any error with
    the column's label so the Review step says which cell is wrong."""
    if value is None:
        return None
    try:
        return parse(value)
    except ValueError as error:
        raise ValueError(f"{label}: “{value}” {error}") from None


def _row_error(error: ValueError, labels: dict[str, str]) -> str:
    if isinstance(error, ValidationError):
        return _validation_message(error, labels)
    return str(error)


async def _member_users_by_email(db: AsyncSession, agency_id: uuid.UUID) -> dict[str, User]:
    result = await db.execute(
        select(User).join(AgencyMember, AgencyMember.user_id == User.id).where(AgencyMember.agency_id == agency_id)
    )
    return {user.email.casefold(): user for user in result.scalars().all()}


async def _projects_by_name(db: AsyncSession, agency_id: uuid.UUID) -> dict[str, list[Project]]:
    result = await db.execute(select(Project).where(Project.agency_id == agency_id))
    index: dict[str, list[Project]] = {}
    for project in result.scalars().all():
        index.setdefault(project.name.casefold(), []).append(project)
    return index


def _pick_project(index: dict[str, list[Project]], name: str) -> Project:
    """Projects are matched by name. An archived project is only used when
    it's the sole match; two live projects with the same name (for different
    clients) are ambiguous, and the row says so rather than guessing."""
    matches = index.get(name.casefold(), [])
    if not matches:
        raise ValueError(f"No project named “{name}” — import or create it first")
    live = [project for project in matches if project.status != STATUS_ARCHIVED] or matches
    if len(live) > 1:
        raise ValueError(f"More than one project is named “{name}” — rename one so the import can tell them apart")
    return live[0]


# ---- Leads ------------------------------------------------------------------

_LEAD_LABELS = {field.key: field.label for field in LEAD_FIELDS} | {"estimated_value_cents": "Estimated value"}


async def import_leads(
    db: AsyncSession, agency: Agency, *, rows: list[LeadImportRow], actor: User, dry_run: bool
) -> ImportResultRead:
    limits = await billing_service.get_plan_limits(db, agency.id)
    held = await db.execute(select(func.count()).select_from(Lead).where(Lead.agency_id == agency.id))
    remaining = None if limits.max_leads is None else max(0, limits.max_leads - int(held.scalar_one()))

    existing = await db.execute(select(Lead.name, Lead.contact_email).where(Lead.agency_id == agency.id))
    existing_names: set[str] = set()
    existing_emails: set[str] = set()
    for name, email in existing.all():
        existing_names.add(name.casefold())
        if email:
            existing_emails.add(email.casefold())

    seen_names: dict[str, int] = {}
    seen_emails: dict[str, int] = {}
    results: list[ImportRowResult] = []
    to_create: list[tuple[LeadCreate, str]] = []

    for row in rows:
        data = {key: _clean(value) for key, value in row.model_dump(exclude={"row"}).items()}
        label = data["name"] or f"Row {row.row}"
        if not data["name"]:
            results.append(_invalid(row.row, label, "Lead name is required"))
            continue

        lead_status = (data.pop("status") or LEAD_STATUSES[0]).casefold()
        if lead_status not in LEAD_STATUSES:
            results.append(_invalid(row.row, label, f"Status must be one of: {', '.join(LEAD_STATUSES)}"))
            continue
        try:
            value_cents = _typed("Estimated value", parse_money_cents, data.pop("estimated_value"))
            lead = LeadCreate.model_validate({**data, "estimated_value_cents": value_cents, "source": "import"})
        except ValueError as error:
            results.append(_invalid(row.row, label, _row_error(error, _LEAD_LABELS)))
            continue

        name_key = lead.name.casefold()
        email_key = lead.contact_email.casefold() if lead.contact_email else None
        duplicate: str | None = None
        if name_key in existing_names:
            duplicate = f"You already have a lead named “{lead.name}”"
        elif email_key and email_key in existing_emails:
            duplicate = "You already have a lead with this contact email"
        elif name_key in seen_names:
            duplicate = f"Same lead name as row {seen_names[name_key]}"
        elif email_key and email_key in seen_emails:
            duplicate = f"Same contact email as row {seen_emails[email_key]}"
        if duplicate:
            results.append(_duplicate(row.row, label, duplicate))
            continue
        seen_names[name_key] = row.row
        if email_key:
            seen_emails[email_key] = row.row

        if remaining is not None and len(to_create) >= remaining:
            results.append(_over_limit(row.row, label, limits.name, limits.max_leads, "leads"))
            continue
        to_create.append((lead, lead_status))
        results.append(ImportRowResult(row=row.row, label=label, status="ok"))

    if not dry_run and to_create:
        now = datetime.now(UTC)
        leads = [
            Lead(agency_id=agency.id, status=lead_status, owner_id=actor.id, last_activity_at=now, **lead.model_dump())
            for lead, lead_status in to_create
        ]
        db.add_all(leads)
        await db.flush()  # lead ids, for their timeline events
        db.add_all(
            LeadEvent(
                lead_id=lead.id,
                kind=LEAD_EVENT_CREATED,
                body=f"{actor.full_name} imported this lead",
                actor_id=actor.id,
                actor_name=actor.full_name,
            )
            for lead in leads
        )
        await db.commit()
        count = len(leads)
        await activity_service.log_agency_activity(
            db,
            agency.id,
            category=CATEGORY_CLIENTS,
            event_type="leads_imported",
            summary=f"{actor.full_name} imported {count} lead{'' if count == 1 else 's'}",
            actor=actor,
        )

    return _result(results, dry_run=dry_run, plan_name=limits.name, limit=limits.max_leads, remaining=remaining)


# ---- Projects ---------------------------------------------------------------

_PROJECT_LABELS = {field.key: field.label for field in PROJECT_FIELDS} | {
    "default_hourly_rate_cents": "Hourly rate",
    "client_id": "Client",
}


def _project_status(value: str | None) -> str:
    if value is None:
        return STATUS_PLANNING
    key = re.sub(r"[\s-]+", "_", value.strip().casefold())
    if key not in project_statuses:
        labels = ", ".join(project_status.replace("_", " ") for project_status in project_statuses)
        raise ValueError(f"Status must be one of: {labels}")
    return key


async def import_projects(
    db: AsyncSession, agency: Agency, *, rows: list[ProjectImportRow], actor: User, dry_run: bool
) -> ImportResultRead:
    limits = await billing_service.get_plan_limits(db, agency.id)
    active = await db.execute(
        select(func.count())
        .select_from(Project)
        .where(Project.agency_id == agency.id, Project.status != STATUS_ARCHIVED)
    )
    limit = limits.max_active_projects
    remaining = None if limit is None else max(0, limit - int(active.scalar_one()))

    clients = (await db.execute(select(AgencyClient).where(AgencyClient.agency_id == agency.id))).scalars().all()
    clients_by_name: dict[str, list[AgencyClient]] = {}
    for client in clients:
        clients_by_name.setdefault(client.name.casefold(), []).append(client)
    existing = await db.execute(select(Project.client_id, Project.name).where(Project.agency_id == agency.id))
    existing_keys = {(client_id, name.casefold()) for client_id, name in existing.all()}

    seen: dict[tuple[uuid.UUID, str], int] = {}
    results: list[ImportRowResult] = []
    to_create: list[tuple[int, ProjectCreate]] = []  # (result index, data)
    active_added = 0

    for row in rows:
        data = {key: _clean(value) for key, value in row.model_dump(exclude={"row"}).items()}
        label = data["name"] or f"Row {row.row}"
        try:
            if not data["name"]:
                raise ValueError("Project name is required")
            if not data["client"]:
                raise ValueError("Client is required")
            matches = clients_by_name.get(data["client"].casefold(), [])
            live = [client for client in matches if client.is_active] or matches
            if not live:
                raise ValueError(f"No client named “{data['client']}” — import clients first")
            if len(live) > 1:
                raise ValueError(f"More than one client is named “{data['client']}”")
            client = live[0]
            start = _typed("Start date", parse_date, data["start_date"])
            due = _typed("Due date", parse_date, data["due_date"])
            if start and due and due < start:
                raise ValueError("Due date is before the start date")
            project = ProjectCreate.model_validate(
                {
                    "name": data["name"],
                    "client_id": client.id,
                    "description": data["description"],
                    "status": _project_status(data["status"]),
                    "start_date": start,
                    "due_date": due,
                    "default_hourly_rate_cents": _typed("Hourly rate", parse_money_cents, data["hourly_rate"]),
                }
            )
        except ValueError as error:
            results.append(_invalid(row.row, label, _row_error(error, _PROJECT_LABELS)))
            continue

        key = (client.id, project.name.casefold())
        if key in existing_keys:
            results.append(_duplicate(row.row, label, f"{client.name} already has a project named “{project.name}”"))
            continue
        if key in seen:
            results.append(_duplicate(row.row, label, f"Same project and client as row {seen[key]}"))
            continue
        seen[key] = row.row

        # Archived projects don't count toward the plan's active-project cap.
        counts_toward_limit = project.status != STATUS_ARCHIVED
        if counts_toward_limit and remaining is not None and active_added >= remaining:
            results.append(_over_limit(row.row, label, limits.name, limit, "active projects"))
            continue
        active_added += int(counts_toward_limit)
        to_create.append((len(results), project))
        results.append(ImportRowResult(row=row.row, label=label, status="ok"))

    if not dry_run and to_create:
        created = 0
        # Through the normal path, one project per commit: each gets a unique
        # slug, the default board columns, and the importer as a member. A
        # failure (e.g. someone else filled the plan meanwhile) is reported on
        # its row and the import goes on.
        for index, project in to_create:
            try:
                await projects_service.create_project(
                    db,
                    agency,
                    created_by=actor,
                    client_id=project.client_id,
                    name=project.name,
                    description=project.description,
                    status_=project.status,
                    start_date=project.start_date,
                    due_date=project.due_date,
                    default_hourly_rate_cents=project.default_hourly_rate_cents,
                    log_activity=False,
                )
            except HTTPException as error:
                results[index].status = "over_limit" if error.status_code == 402 else "invalid"
                results[index].message = str(error.detail)
                continue
            created += 1
        if created:
            await activity_service.log_agency_activity(
                db,
                agency.id,
                category=CATEGORY_PROJECTS,
                event_type="projects_imported",
                summary=f"{actor.full_name} imported {created} project{'' if created == 1 else 's'}",
                actor=actor,
            )

    return _result(results, dry_run=dry_run, plan_name=limits.name, limit=limit, remaining=remaining)


# ---- Tasks ------------------------------------------------------------------

_TASK_TITLE_MAX = 255
_TASK_DESCRIPTION_MAX = 4096
_COLUMN_NAME_MAX = 100
_DEFAULT_COLUMN = "To Do"


@dataclass
class _PlannedTask:
    project: Project
    # An existing column, or None when the column is created by this import
    # (looked up by ``column_key`` once it exists).
    task_list: ProjectTaskList | None
    column_key: str
    title: str
    description: str | None
    due_date: date | None
    assignee: User | None


async def import_tasks(
    db: AsyncSession, agency: Agency, *, rows: list[TaskImportRow], actor: User, dry_run: bool
) -> ImportResultRead:
    """Tasks land on the named project's board. A blank column means the
    first one; a column the board doesn't have yet is created (and the row
    says so in Review), so a board exported from another tool keeps its
    shape. No plan limit applies to tasks."""
    projects = await _projects_by_name(db, agency.id)
    members = await _member_users_by_email(db, agency.id)
    project_ids = [project.id for matches in projects.values() for project in matches]

    lists_by_project: dict[uuid.UUID, list[ProjectTaskList]] = {}
    existing_titles: set[tuple[uuid.UUID, str]] = set()
    if project_ids:
        task_lists = await db.execute(
            select(ProjectTaskList)
            .where(ProjectTaskList.project_id.in_(project_ids))
            .order_by(ProjectTaskList.position)
        )
        for task_list in task_lists.scalars().all():
            lists_by_project.setdefault(task_list.project_id, []).append(task_list)
        titles = await db.execute(
            select(ProjectTask.project_id, ProjectTask.title).where(ProjectTask.project_id.in_(project_ids))
        )
        existing_titles = {(project_id, title.casefold()) for project_id, title in titles.all()}

    seen: dict[tuple[uuid.UUID, str], int] = {}
    new_columns: dict[tuple[uuid.UUID, str], str] = {}  # (project id, column key) -> display name
    results: list[ImportRowResult] = []
    planned: list[_PlannedTask] = []

    for row in rows:
        data = {key: _clean(value) for key, value in row.model_dump(exclude={"row"}).items()}
        label = data["title"] or f"Row {row.row}"
        try:
            if not data["title"]:
                raise ValueError("Task is required")
            if not data["project"]:
                raise ValueError("Project is required")
            project = _pick_project(projects, data["project"])
            if len(data["title"]) > _TASK_TITLE_MAX:
                raise ValueError(f"Task: at most {_TASK_TITLE_MAX} characters")
            if data["description"] and len(data["description"]) > _TASK_DESCRIPTION_MAX:
                raise ValueError(f"Description: at most {_TASK_DESCRIPTION_MAX} characters")
            if data["column"] and len(data["column"]) > _COLUMN_NAME_MAX:
                raise ValueError(f"Column: at most {_COLUMN_NAME_MAX} characters")
            due = _typed("Due date", parse_date, data["due_date"])
            assignee = None
            if data["assignee"]:
                assignee = members.get(data["assignee"].casefold())
                if assignee is None:
                    raise ValueError(f"Assignee email: {data['assignee']} isn't on your team")
        except ValueError as error:
            results.append(_invalid(row.row, label, str(error)))
            continue

        key = (project.id, data["title"].casefold())
        if key in existing_titles:
            results.append(_duplicate(row.row, label, f"{project.name} already has a task named “{data['title']}”"))
            continue
        if key in seen:
            results.append(_duplicate(row.row, label, f"Same task and project as row {seen[key]}"))
            continue
        seen[key] = row.row

        board = lists_by_project.get(project.id, [])
        column_name = data["column"] or (board[0].name if board else _DEFAULT_COLUMN)
        column_key = column_name.casefold()
        task_list = next((tl for tl in board if tl.name.casefold() == column_key), None)
        message = None
        if task_list is None:
            display = new_columns.setdefault((project.id, column_key), column_name)
            message = f"Adds a new column “{display}” to {project.name}"
        planned.append(
            _PlannedTask(
                project=project,
                task_list=task_list,
                column_key=column_key,
                title=data["title"],
                description=data["description"],
                due_date=due,
                assignee=assignee,
            )
        )
        results.append(ImportRowResult(row=row.row, label=label, status="ok", message=message))

    if not dry_run and planned:
        created_lists: dict[tuple[uuid.UUID, str], ProjectTaskList] = {}
        for (project_id, column_key), name in new_columns.items():
            board = lists_by_project.setdefault(project_id, [])
            task_list = ProjectTaskList(
                project_id=project_id, name=name, position=(board[-1].position + 1) if board else 0
            )
            db.add(task_list)
            board.append(task_list)
            created_lists[(project_id, column_key)] = task_list
        await db.flush()  # ids for the new columns

        # New cards go to the bottom of their column, after what's there.
        list_ids = [tl.id for board in lists_by_project.values() for tl in board]
        counts_result = await db.execute(
            select(ProjectTask.list_id, func.count())
            .where(ProjectTask.list_id.in_(list_ids))
            .group_by(ProjectTask.list_id)
        )
        counts: dict[uuid.UUID, int] = {list_id: int(count) for list_id, count in counts_result.all()}

        assigned: dict[uuid.UUID, list[Project]] = {}
        for task in planned:
            task_list = task.task_list or created_lists[(task.project.id, task.column_key)]
            position = counts.get(task_list.id, 0)
            counts[task_list.id] = position + 1
            db.add(
                ProjectTask(
                    project_id=task.project.id,
                    list_id=task_list.id,
                    title=task.title,
                    description=task.description,
                    due_date=task.due_date,
                    assignee_id=task.assignee.id if task.assignee else None,
                    position=position,
                )
            )
            if task.assignee:
                assigned.setdefault(task.assignee.id, []).append(task.project)
        await db.commit()

        # One notification per assignee for the whole batch, not one per task.
        for user_id, assigned_projects in assigned.items():
            count = len(assigned_projects)
            names = sorted({project.name for project in assigned_projects})
            await notifications_service.notify(
                db,
                user_id=user_id,
                category=NOTIFY_CATEGORY_PROJECTS,
                event_type=EVENT_TASK_ASSIGNED,
                title=f"{actor.full_name} assigned you {count} task{'' if count == 1 else 's'}",
                body=f"From an import into {', '.join(names[:3])}{' and more' if len(names) > 3 else ''}.",
                link=f"/projects/{assigned_projects[0].id}" if len(names) == 1 else "/dashboard/my-work",
                agency_id=agency.id,
                actor=actor,
            )
        count = len(planned)
        await activity_service.log_agency_activity(
            db,
            agency.id,
            category=CATEGORY_PROJECTS,
            event_type="tasks_imported",
            summary=f"{actor.full_name} imported {count} task{'' if count == 1 else 's'}",
            actor=actor,
        )

    plan_name = (await billing_service.get_plan_limits(db, agency.id)).name
    return _result(results, dry_run=dry_run, plan_name=plan_name, limit=None, remaining=None)


# ---- Time entries -----------------------------------------------------------

_ENTRY_DESCRIPTION_MAX = 1024


def _entry_start(day: date) -> datetime:
    """A date-only entry starts at 12:00 UTC: in any timezone from UTC-12 to
    UTC+12 it still lands on the day the spreadsheet said."""
    return datetime.combine(day, time(12, 0), tzinfo=UTC)


async def import_time_entries(
    db: AsyncSession, agency: Agency, *, rows: list[TimeEntryImportRow], actor: User, role: str, dry_run: bool
) -> ImportResultRead:
    """Members can import only their own time (just as they can only log
    their own); owners and admins can import anyone's. A blank team member
    column means the importer. No plan limit applies to time entries."""
    can_import_for_others = role in (ROLE_OWNER, ROLE_ADMIN)
    projects = await _projects_by_name(db, agency.id)
    members = await _member_users_by_email(db, agency.id)
    project_ids = [project.id for matches in projects.values() for project in matches]

    tasks_by_project: dict[uuid.UUID, dict[str, list[uuid.UUID]]] = {}
    if project_ids:
        tasks = await db.execute(
            select(ProjectTask.project_id, ProjectTask.id, ProjectTask.title).where(
                ProjectTask.project_id.in_(project_ids)
            )
        )
        for project_id, task_id, title in tasks.all():
            tasks_by_project.setdefault(project_id, {}).setdefault(title.casefold(), []).append(task_id)
    entries = await db.execute(
        select(
            TimeEntry.user_id,
            TimeEntry.project_id,
            TimeEntry.started_at,
            TimeEntry.duration_minutes,
            TimeEntry.description,
        ).where(TimeEntry.agency_id == agency.id)
    )
    existing_keys = {
        (user_id, project_id, started_at.date(), minutes, (description or "").casefold())
        for user_id, project_id, started_at, minutes, description in entries.all()
    }

    seen: dict[tuple, int] = {}
    results: list[ImportRowResult] = []
    to_create: list[TimeEntry] = []

    for row in rows:
        data = {key: _clean(value) for key, value in row.model_dump(exclude={"row"}).items()}
        label = " · ".join(filter(None, [data["date"], data["project"], data["hours"] and f"{data['hours']} h"]))
        label = label or f"Row {row.row}"
        try:
            for key, name in (("date", "Date"), ("hours", "Hours"), ("project", "Project")):
                if not data[key]:
                    raise ValueError(f"{name} is required")
            day = _typed("Date", parse_date, data["date"])
            minutes = _typed("Hours", parse_duration_minutes, data["hours"])
            assert day is not None and minutes is not None and data["project"]  # required, checked above
            project = _pick_project(projects, data["project"])

            user = actor
            if data["member"]:
                found = members.get(data["member"].casefold())
                if found is None:
                    raise ValueError(f"Team member email: {data['member']} isn't on your team")
                if found.id != actor.id and not can_import_for_others:
                    raise ValueError("Members can only import their own time — ask an owner or admin")
                user = found

            task_id = None
            if data["task"]:
                task_ids = tasks_by_project.get(project.id, {}).get(data["task"].casefold(), [])
                if not task_ids:
                    raise ValueError(f"Task: {project.name} has no task named “{data['task']}”")
                if len(task_ids) > 1:
                    raise ValueError(f"Task: {project.name} has more than one task named “{data['task']}”")
                task_id = task_ids[0]

            description = data["description"]
            if description and len(description) > _ENTRY_DESCRIPTION_MAX:
                raise ValueError(f"Description: at most {_ENTRY_DESCRIPTION_MAX} characters")
            billable = _typed("Billable", parse_bool, data["billable"])
            rate = _typed("Hourly rate", parse_money_cents, data["hourly_rate"])
        except ValueError as error:
            results.append(_invalid(row.row, label, str(error)))
            continue

        key = (user.id, project.id, day, minutes, (description or "").casefold())
        if key in existing_keys:
            message = "Already logged (same person, project, date, hours and description)"
            results.append(_duplicate(row.row, label, message))
            continue
        if key in seen:
            results.append(_duplicate(row.row, label, f"Same entry as row {seen[key]}"))
            continue
        seen[key] = row.row

        started_at = _entry_start(day)
        to_create.append(
            TimeEntry(
                agency_id=agency.id,
                project_id=project.id,
                task_id=task_id,
                user_id=user.id,
                description=description,
                started_at=started_at,
                ended_at=started_at + timedelta(minutes=minutes),
                duration_minutes=minutes,
                is_billable=True if billable is None else billable,
                hourly_rate_cents=time_service.resolve_hourly_rate_cents(rate, project),
            )
        )
        results.append(ImportRowResult(row=row.row, label=label, status="ok"))

    if not dry_run and to_create:
        db.add_all(to_create)
        await db.commit()
        count = len(to_create)
        await activity_service.log_agency_activity(
            db,
            agency.id,
            category=CATEGORY_PROJECTS,
            event_type="time_entries_imported",
            summary=f"{actor.full_name} imported {count} time entr{'y' if count == 1 else 'ies'}",
            actor=actor,
        )

    plan_name = (await billing_service.get_plan_limits(db, agency.id)).name
    return _result(results, dry_run=dry_run, plan_name=plan_name, limit=None, remaining=None)


# ---- Services ---------------------------------------------------------------

_SERVICE_LABELS = {field.key: field.label for field in SERVICE_FIELDS} | {
    "unit_price_cents": "Price",
    "pricing_type": "Pricing",
}

# What people write for each pricing type, normalized like headers are
# (lowercase, letters and digits only). The export writes the labels
# ("Fixed price", "Hourly", "Monthly"), so a downloaded file re-imports.
_PRICING_WORDS: dict[str, str] = {
    **dict.fromkeys(
        ("fixed", "fixedprice", "flat", "flatfee", "flatrate", "project", "oneoff", "onetime", "once", "each"),
        PRICING_FIXED,
    ),
    **dict.fromkeys(("hourly", "hour", "hr", "hrs", "perhour", "perhr", "hours"), PRICING_HOURLY),
    **dict.fromkeys(
        ("monthly", "month", "mo", "permonth", "permo", "retainer", "monthlyretainer", "subscription"),
        PRICING_MONTHLY,
    ),
}
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def _service_pricing(value: str | None) -> str:
    if value is None:
        return PRICING_FIXED
    pricing = _PRICING_WORDS.get(_NON_ALNUM_RE.sub("", value.lower()))
    if pricing is None:
        raise ValueError(f"Pricing: \u201c{value}\u201d must be fixed, hourly or monthly")
    return pricing


def _service_archived(value: str | None) -> bool:
    if value is None:
        return False
    text = value.strip().casefold()
    if text in ("active", "live", "current"):
        return False
    if text in ("archived", "inactive", "retired"):
        return True
    raise ValueError(f"Status: \u201c{value}\u201d must be Active or Archived")


def _service_quantity(value: str) -> Decimal:
    try:
        quantity = Decimal(value.replace(",", "").strip())
    except InvalidOperation:
        raise ValueError("isn't a number") from None
    if not quantity.is_finite() or quantity <= 0:
        raise ValueError("must be more than zero")
    return quantity.quantize(Decimal("0.01"))


def _service_starting(value: str | None) -> bool:
    """Yes/No (and the like); blank is No."""
    if value is None:
        return False
    text = value.strip().casefold()
    if text in ("yes", "y", "true", "1", "from", "starting"):
        return True
    if text in ("no", "n", "false", "0", "fixed", "exact"):
        return False
    raise ValueError(f"Starting price: \u201c{value}\u201d must be Yes or No")


def _service_row(data: dict[str, str | None]) -> tuple[ServiceCreate, bool]:
    archived = _service_archived(data["status"])
    created = ServiceCreate.model_validate(
        {
            "name": data["name"],
            "description": data["description"],
            "pricing_type": _service_pricing(data["pricing"]),
            "unit_price_cents": _typed("Price", parse_money_cents, data["price"]),
            "default_quantity": _typed("Default quantity", _service_quantity, data["default_quantity"]) or Decimal("1"),
            "is_starting_price": _service_starting(data.get("starting_price")),
        }
    )
    return created, archived


async def _service_names(db: AsyncSession, agency_id: uuid.UUID) -> tuple[set[str], set[str]]:
    """(active names, all names), casefolded."""
    existing = await db.execute(select(Service.name, Service.is_archived).where(Service.agency_id == agency_id))
    active: set[str] = set()
    every: set[str] = set()
    for name, is_archived in existing.all():
        every.add(name.casefold())
        if not is_archived:
            active.add(name.casefold())
    return active, every


async def import_services(
    db: AsyncSession, agency: Agency, *, rows: list[ServiceImportRow], actor: User, dry_run: bool
) -> ImportResultRead:
    """The catalog has no plan cap. A row is a duplicate when an active
    service (or an earlier row) already has its name; an archived row is a
    duplicate when any service has its name, so re-importing an export never
    piles up copies of retired services."""
    limits = await billing_service.get_plan_limits(db, agency.id)
    active_names, all_names = await _service_names(db, agency.id)

    seen: dict[str, int] = {}
    results: list[ImportRowResult] = []
    to_create: list[tuple[ServiceCreate, bool, str | None]] = []

    for row in rows:
        data = {key: _clean(value) for key, value in row.model_dump(exclude={"row"}).items()}
        label = data["name"] or f"Row {row.row}"
        missing = "Service name" if not data["name"] else "Price" if not data["price"] else None
        if missing:
            results.append(_invalid(row.row, label, f"{missing} is required"))
            continue
        try:
            created, archived = _service_row(data)
        except ValueError as error:
            results.append(_invalid(row.row, label, _row_error(error, _SERVICE_LABELS)))
            continue

        name = created.name.strip()
        key = name.casefold()
        if key in (all_names if archived else active_names):
            results.append(_duplicate(row.row, label, f"You already have a service named \u201c{name}\u201d"))
            continue
        if key in seen:
            results.append(_duplicate(row.row, label, f"Same service name as row {seen[key]}"))
            continue
        seen[key] = row.row
        to_create.append((created, archived, (data.get("category") or "").strip()[:80] or None))
        results.append(ImportRowResult(row=row.row, label=label, status="ok"))

    if not dry_run and to_create:
        # Categories by name, made the first time one is named.
        categories: dict[str, uuid.UUID] = {}
        for _created, _archived, category in to_create:
            if category and category.casefold() not in categories:
                found = await services_service.get_or_create_category(db, agency.id, category)
                categories[category.casefold()] = found.id
        db.add_all(
            Service(
                agency_id=agency.id,
                created_by_id=actor.id,
                name=created.name.strip(),
                description=(created.description or "").strip() or None,
                pricing_type=created.pricing_type,
                unit_price_cents=created.unit_price_cents,
                default_quantity=created.default_quantity,
                is_archived=archived,
                is_starting_price=created.is_starting_price,
                category_id=categories.get(category.casefold()) if category else None,
            )
            for created, archived, category in to_create
        )
        await db.commit()
        count = len(to_create)
        await activity_service.log_agency_activity(
            db,
            agency.id,
            category=CATEGORY_SETTINGS,
            event_type="services_imported",
            summary=f"{actor.full_name} imported {count} service{'' if count == 1 else 's'}",
            actor=actor,
        )

    return _result(results, dry_run=dry_run, plan_name=limits.name, limit=None, remaining=None)

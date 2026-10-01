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

from fastapi import HTTPException, status
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_CLIENTS, CATEGORY_TEAM
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
from binx_api.modules.imports.fields import CLIENT_FIELDS
from binx_api.modules.imports.schemas import (
    ClientImportRow,
    ImportResultRead,
    ImportRowResult,
    TeamImportRow,
)
from binx_api.modules.users.models import User

_FIELD_LABELS = {field.key: field.label for field in CLIENT_FIELDS}
_email_adapter = TypeAdapter(EmailStr)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _validation_message(error: ValidationError) -> str:
    parts = []
    for item in error.errors():
        field = str(item["loc"][0]) if item["loc"] else ""
        label = _FIELD_LABELS.get(field, field.replace("_", " ").capitalize())
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
            email = _email_adapter.validate_python(raw_email)
        except ValidationError:
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

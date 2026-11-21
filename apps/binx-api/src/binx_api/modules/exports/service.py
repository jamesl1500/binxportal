"""
Builds each export as (headers, rows) — the writer turns that into a file.

Round-trip by design: for every kind that can also be imported, the first
columns are exactly the import fields' labels (imports/fields.py), so a
downloaded file re-imports with every column matched automatically. Extra
read-only columns (status, owner, dates) follow, under headers that aren't
any import field's alias, so they're simply left unmapped on the way back.

Visibility matches what the same member sees in the app: emails a teammate
chose to hide stay hidden from non-admins, and admin-only fields (member
admin notes, pending invitations) are only exported for owners/admins.
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import INVITATION_PENDING, AgencyClient
from binx_api.modules.exports.writer import Cell
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.leads import service as leads_service
from binx_api.modules.projects.models import Project, ProjectTask, ProjectTaskList
from binx_api.modules.proposals import service as proposals_service
from binx_api.modules.time_tracking.models import TimeEntry
from binx_api.modules.users.models import User, UserPrivacySettings

ExportKind = str  # one of EXPORTERS' keys


@dataclass
class ExportTable:
    headers: list[str]
    rows: list[list[Cell]]
    sheet_title: str


def _money(cents: int | None) -> Decimal | None:
    return None if cents is None else (Decimal(cents) / 100).quantize(Decimal("0.01"))


def _hours(minutes: int) -> Decimal:
    return (Decimal(minutes) / 60).quantize(Decimal("0.01"))


def _label(value: str | None) -> str | None:
    """ "waiting_on_client" -> "Waiting on client"."""
    return value.replace("_", " ").capitalize() if value else None


async def _visible_emails(db: AsyncSession, user_ids: set[uuid.UUID], *, viewer_is_admin: bool) -> dict:
    """user id -> the email this viewer may see (None when hidden). Same rule
    as the team list (agencies/router.py::_member_read)."""
    if not user_ids:
        return {}
    result = await db.execute(
        select(User.id, User.email, UserPrivacySettings.show_email_to_team)
        .outerjoin(UserPrivacySettings, UserPrivacySettings.user_id == User.id)
        .where(User.id.in_(user_ids))
    )
    return {
        user_id: email if viewer_is_admin or show is None or show else None for user_id, email, show in result.all()
    }


# ---- Kinds that can be imported too -----------------------------------------


async def export_clients(db: AsyncSession, agency_id: uuid.UUID, *, viewer_is_admin: bool) -> ExportTable:
    result = await db.execute(
        select(AgencyClient).where(AgencyClient.agency_id == agency_id).order_by(AgencyClient.name)
    )
    rows: list[list[Cell]] = [
        [
            client.name,
            client.primary_contact_name,
            client.primary_contact_email,
            client.primary_contact_phone,
            client.website,
            client.notes,
            client.billing_email,
            client.billing_address,
            "Active" if client.is_active else "Archived",
            client.created_at,
        ]
        for client in result.scalars().all()
    ]
    headers = [
        "Client name",
        "Contact name",
        "Contact email",
        "Contact phone",
        "Website",
        "Notes",
        "Billing email",
        "Billing address",
        "Client status",
        "Added",
    ]
    return ExportTable(headers, rows, "Clients")


async def export_team(db: AsyncSession, agency_id: uuid.UUID, *, viewer_is_admin: bool) -> ExportTable:
    members = await agencies_service.list_agency_members(db, agency_id)
    headers = ["Email", "Role", "Name", "Agency title", "Membership", "Joined"]
    if viewer_is_admin:
        headers.append("Admin notes")
    rows: list[list[Cell]] = []
    for member, user, privacy, _profile in members:
        show_email = viewer_is_admin or privacy is None or privacy.show_email_to_team
        row: list[Cell] = [
            user.email if show_email else None,
            member.role,
            user.full_name,
            member.title,
            "Active",
            member.created_at,
        ]
        if viewer_is_admin:
            row.append(member.admin_notes)
        rows.append(row)
    if viewer_is_admin:
        # Pending invitations are on the admin-only Invitations tab.
        now = datetime.now(UTC)
        for invitation, _inviter in await agencies_service.list_invitations(db, agency_id):
            if invitation.status == INVITATION_PENDING and invitation.expires_at > now:
                rows.append([invitation.email, invitation.role, None, None, "Invited", invitation.created_at, None])
    return ExportTable(headers, rows, "Team")


async def export_leads(db: AsyncSession, agency_id: uuid.UUID, *, viewer_is_admin: bool) -> ExportTable:
    leads = await leads_service.list_leads(db, agency_id)
    rows: list[list[Cell]] = [
        [
            lead.name,
            lead.contact_name,
            lead.contact_email,
            lead.contact_phone,
            lead.website,
            _money(lead.estimated_value_cents),
            lead.status,
            lead.notes,
            _label(lead.source),
            owner_name,
            lead.score,
            client_name,
            lead.created_at,
            lead.last_activity_at,
        ]
        for lead, owner_name, client_name in leads
    ]
    headers = [
        "Lead name",
        "Contact name",
        "Contact email",
        "Contact phone",
        "Website",
        "Estimated value",
        "Status",
        "Notes",
        "Lead source",
        "Lead owner",
        "Score",
        "Converted to client",
        "Added",
        "Last activity",
    ]
    return ExportTable(headers, rows, "Leads")


async def export_projects(db: AsyncSession, agency_id: uuid.UUID, *, viewer_is_admin: bool) -> ExportTable:
    result = await db.execute(
        select(Project, AgencyClient.name)
        .join(AgencyClient, AgencyClient.id == Project.client_id)
        .where(Project.agency_id == agency_id)
        .order_by(AgencyClient.name, Project.name)
    )
    rows: list[list[Cell]] = [
        [
            project.name,
            client_name,
            project.status,
            project.description,
            project.start_date,
            project.due_date,
            _money(project.default_hourly_rate_cents),
            project.created_at,
        ]
        for project, client_name in result.all()
    ]
    headers = ["Project name", "Client", "Status", "Description", "Start date", "Due date", "Hourly rate", "Added"]
    return ExportTable(headers, rows, "Projects")


async def export_tasks(db: AsyncSession, agency_id: uuid.UUID, *, viewer_is_admin: bool) -> ExportTable:
    result = await db.execute(
        select(ProjectTask, Project.name, ProjectTaskList.name, User.id, User.full_name)
        .join(Project, Project.id == ProjectTask.project_id)
        .join(ProjectTaskList, ProjectTaskList.id == ProjectTask.list_id)
        .outerjoin(User, User.id == ProjectTask.assignee_id)
        .where(Project.agency_id == agency_id)
        .order_by(Project.name, ProjectTaskList.position, ProjectTask.position)
    )
    records = result.all()
    emails = await _visible_emails(
        db, {user_id for *_rest, user_id, _name in records if user_id}, viewer_is_admin=viewer_is_admin
    )
    rows: list[list[Cell]] = [
        [
            project_name,
            task.title,
            column_name,
            task.description,
            task.due_date,
            emails.get(user_id) if user_id else None,
            assignee_name,
            task.created_at,
        ]
        for task, project_name, column_name, user_id, assignee_name in records
    ]
    headers = ["Project", "Task", "Column", "Description", "Due date", "Assignee email", "Assignee", "Added"]
    return ExportTable(headers, rows, "Tasks")


async def export_time_entries(db: AsyncSession, agency_id: uuid.UUID, *, viewer_is_admin: bool) -> ExportTable:
    result = await db.execute(
        select(TimeEntry, Project.name, ProjectTask.title, User.full_name)
        .join(Project, Project.id == TimeEntry.project_id)
        .outerjoin(ProjectTask, ProjectTask.id == TimeEntry.task_id)
        .join(User, User.id == TimeEntry.user_id)
        .where(TimeEntry.agency_id == agency_id, TimeEntry.ended_at.is_not(None))
        .order_by(TimeEntry.started_at.desc())
    )
    records = result.all()
    emails = await _visible_emails(db, {entry.user_id for entry, *_rest in records}, viewer_is_admin=viewer_is_admin)
    rows: list[list[Cell]] = [
        [
            entry.started_at.date(),
            _hours(entry.duration_minutes),
            project_name,
            task_title,
            emails.get(entry.user_id),
            entry.description,
            entry.is_billable,
            _money(entry.hourly_rate_cents),
            user_name,
            entry.invoice_line_item_id is not None,
        ]
        for entry, project_name, task_title, user_name in records
    ]
    headers = [
        "Date",
        "Hours",
        "Project",
        "Task",
        "Team member email",
        "Description",
        "Billable",
        "Hourly rate",
        "Team member",
        "Invoiced",
    ]
    return ExportTable(headers, rows, "Time entries")


# ---- Export-only kinds --------------------------------------------------------


async def export_invoices(db: AsyncSession, agency_id: uuid.UUID, *, viewer_is_admin: bool) -> ExportTable:
    invoices = await invoicing_service.list_invoices(db, agency_id)
    rows: list[list[Cell]] = [
        [
            invoice.number,
            client_name,
            project_name,
            _label(invoicing_service.display_status(invoice)),
            invoice.issue_date,
            invoice.due_date,
            invoice.currency,
            _money(invoice.subtotal_cents),
            _money(invoice.discount_cents),
            _money(invoice.tax_cents),
            _money(invoice.total_cents),
            _money(invoice.amount_paid_cents),
            _money(invoice.total_cents - invoice.amount_paid_cents),
        ]
        for invoice, client_name, project_name in invoices
    ]
    headers = [
        "Invoice number",
        "Client",
        "Project",
        "Status",
        "Issue date",
        "Due date",
        "Currency",
        "Subtotal",
        "Discount",
        "Tax",
        "Total",
        "Paid",
        "Balance due",
    ]
    return ExportTable(headers, rows, "Invoices")


async def export_proposals(db: AsyncSession, agency_id: uuid.UUID, *, viewer_is_admin: bool) -> ExportTable:
    proposals = await proposals_service.list_proposals(db, agency_id)
    rows: list[list[Cell]] = [
        [
            proposal.title,
            proposal.recipient_name,
            proposal.recipient_email,
            client_name or lead_name,
            "Client" if client_name else ("Lead" if lead_name else None),
            _label(proposal.status),
            proposal.currency,
            _money(proposal.total_cents),
            proposal.sent_at,
            proposal.viewed_at,
            proposal.decided_at,
            proposal.decline_reason,
            proposal.created_at,
        ]
        for proposal, lead_name, client_name in proposals
    ]
    headers = [
        "Title",
        "Recipient name",
        "Recipient email",
        "For",
        "For type",
        "Status",
        "Currency",
        "Total",
        "Sent",
        "Viewed",
        "Decided",
        "Decline reason",
        "Created",
    ]
    return ExportTable(headers, rows, "Proposals")


Exporter = Callable[..., Awaitable[ExportTable]]

EXPORTERS: dict[str, Exporter] = {
    "clients": export_clients,
    "team": export_team,
    "leads": export_leads,
    "projects": export_projects,
    "tasks": export_tasks,
    "time_entries": export_time_entries,
    "invoices": export_invoices,
    "proposals": export_proposals,
}

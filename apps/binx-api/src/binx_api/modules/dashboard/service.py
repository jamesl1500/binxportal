"""Dashboard aggregation reads. Today just "my work" — the caller's assigned,
not-done tasks across every project in the agency. A task is "done" when it
sits in its project's last board column (the same implicit-status model the
kanban board uses)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.schemas import ActivityLogRead
from binx_api.modules.agencies import service as agencies_service
from binx_api.modules.agencies.models import Agency, AgencyClient
from binx_api.modules.dashboard.schemas import DashboardRead, MyTaskRead, MyWorkRead
from binx_api.modules.invoicing import service as invoicing_service
from binx_api.modules.invoicing.models import Invoice
from binx_api.modules.invoicing.schemas import InvoiceRead, InvoiceSummaryRead
from binx_api.modules.messaging import service as messaging_service
from binx_api.modules.projects import service as projects_service
from binx_api.modules.projects.models import Project, ProjectTask, ProjectTaskList
from binx_api.modules.projects.schemas import ProjectRead
from binx_api.modules.users.models import User

ON_HOLD_PROJECTS_LIMIT = 5
OVERDUE_INVOICES_LIMIT = 5
RECENT_ACTIVITY_LIMIT = 6


async def my_work(db: AsyncSession, agency_id: uuid.UUID, user_id: uuid.UUID) -> MyWorkRead:
    # The last (highest-position) list per project — "done" lives there.
    last_position = (
        select(ProjectTaskList.project_id, func.max(ProjectTaskList.position).label("max_pos"))
        .group_by(ProjectTaskList.project_id)
        .subquery()
    )
    done_list_ids = (
        select(ProjectTaskList.id)
        .join(
            last_position,
            (ProjectTaskList.project_id == last_position.c.project_id)
            & (ProjectTaskList.position == last_position.c.max_pos),
        )
        .scalar_subquery()
    )

    rows = (
        await db.execute(
            select(ProjectTask, Project.name, AgencyClient.name, ProjectTaskList.name)
            .join(Project, Project.id == ProjectTask.project_id)
            .join(AgencyClient, AgencyClient.id == Project.client_id)
            .join(ProjectTaskList, ProjectTaskList.id == ProjectTask.list_id)
            .where(
                Project.agency_id == agency_id,
                ProjectTask.assignee_id == user_id,
                ProjectTask.list_id.not_in(done_list_ids),
            )
            .order_by(ProjectTask.due_date.is_(None), ProjectTask.due_date, ProjectTask.created_at)
        )
    ).all()

    today = datetime.now(UTC).date()
    soon = today + timedelta(days=7)
    tasks: list[MyTaskRead] = []
    overdue_count = 0
    due_soon_count = 0
    for task, project_name, client_name, list_name in rows:
        is_overdue = task.due_date is not None and task.due_date < today
        if is_overdue:
            overdue_count += 1
        elif task.due_date is not None and task.due_date <= soon:
            due_soon_count += 1
        tasks.append(
            MyTaskRead(
                id=task.id,
                title=task.title,
                due_date=task.due_date,
                project_id=task.project_id,
                project_name=project_name,
                client_name=client_name,
                list_name=list_name,
                overdue=is_overdue,
            )
        )

    return MyWorkRead(
        tasks=tasks,
        total_open=len(tasks),
        overdue_count=overdue_count,
        due_soon_count=due_soon_count,
    )


# ---- Overview (dashboard aggregate) ----------------------------------------
#
# Response shaping for ProjectRead/InvoiceRead is "built by hand" from a join
# tuple — same as their own routers do — because client_name/project_name are
# denormalized in, not columns. Duplicated here rather than imported from
# projects.router/invoicing.router to keep this module from reaching into
# another module's router layer; the fields are stable and any drift shows up
# immediately in the generated OpenAPI types on the web side.


def _project_read(project: Project, client_name: str, member_count: int) -> ProjectRead:
    return ProjectRead(
        id=project.id,
        agency_id=project.agency_id,
        client_id=project.client_id,
        client_name=client_name,
        name=project.name,
        slug=project.slug,
        description=project.description,
        status=project.status,
        start_date=project.start_date,
        due_date=project.due_date,
        member_count=member_count,
        created_at=project.created_at,
    )


def _invoice_read(invoice: Invoice, client_name: str, project_name: str | None) -> InvoiceRead:
    return InvoiceRead(
        id=invoice.id,
        agency_id=invoice.agency_id,
        client_id=invoice.client_id,
        client_name=client_name,
        project_id=invoice.project_id,
        project_name=project_name,
        number=invoice.number,
        status=invoice.status,
        display_status=invoicing_service._display_status(invoice),
        currency=invoice.currency,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        subtotal_cents=invoice.subtotal_cents,
        discount_cents=invoice.discount_cents,
        tax_cents=invoice.tax_cents,
        total_cents=invoice.total_cents,
        amount_paid_cents=invoice.amount_paid_cents,
        amount_due_cents=invoice.total_cents - invoice.amount_paid_cents,
        created_at=invoice.created_at,
    )


async def overview(db: AsyncSession, agency: Agency, user: User, *, viewer_is_admin: bool) -> DashboardRead:
    """Assembles the Overview tab from the same service calls the individual
    pages already make — one request instead of seven.

    Calls run sequentially, not via asyncio.gather: a single AsyncSession
    holds one underlying DB connection and isn't safe for concurrent
    statements — running these in parallel would raise (or silently
    interleave) against asyncpg. The win here is collapsing 7 HTTP
    round-trips into 1, not parallelizing the queries themselves.
    """
    project_rows = await projects_service.list_projects_for_agency(db, agency.id)
    client_rows = await agencies_service.list_clients(db, agency.id)
    summary = await invoicing_service.agency_invoice_summary(db, agency.id)
    overdue_rows = await invoicing_service.list_invoices(db, agency.id, status_filter="overdue")
    activity_rows = await activity_service.list_agency_activity(
        db, agency.id, viewer_is_admin=viewer_is_admin, limit=RECENT_ACTIVITY_LIMIT
    )
    unread_messages = await messaging_service.unread_total(db, agency, user)
    work = await my_work(db, agency.id, user.id)

    on_hold_projects = [
        _project_read(project, client_name, member_count)
        for project, client_name, member_count in project_rows
        if project.status == "on_hold"
    ][:ON_HOLD_PROJECTS_LIMIT]

    return DashboardRead(
        projects_total=len(project_rows),
        projects_active=sum(1 for project, _client_name, _count in project_rows if project.status == "active"),
        on_hold_projects=on_hold_projects,
        clients_total=len(client_rows),
        clients_active=sum(1 for client in client_rows if client.is_active),
        invoice_summary=InvoiceSummaryRead.model_validate(summary),
        overdue_invoices=[
            _invoice_read(invoice, client_name, project_name)
            for invoice, client_name, project_name in overdue_rows[:OVERDUE_INVOICES_LIMIT]
        ],
        unread_messages=unread_messages,
        my_work=work,
        recent_activity=[ActivityLogRead.model_validate(row) for row in activity_rows],
    )

"""Dashboard aggregation reads. Today just "my work" — the caller's assigned,
not-done tasks across every project in the agency. A task is "done" when it
sits in its project's last board column (the same implicit-status model the
kanban board uses)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies.models import AgencyClient
from binx_api.modules.dashboard.schemas import MyTaskRead, MyWorkRead
from binx_api.modules.projects.models import Project, ProjectTask, ProjectTaskList


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

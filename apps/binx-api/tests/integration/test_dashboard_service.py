"""Integration tests for ``binx_api.modules.dashboard.service.my_work`` — the
cross-project "assigned to me, not done" task rollup."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from binx_api.modules.dashboard import service
from binx_api.modules.projects.service import get_project_board
from tests.factories import add_agency_member, make_agency, make_project, make_task, make_user

pytestmark = pytest.mark.integration


class TestMyWork:
    async def test_only_my_not_done_tasks_across_projects(self, db_session) -> None:
        owner = await make_user(db_session)
        me = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=me)

        p1 = await make_project(db_session, agency=agency, created_by=owner, name="Alpha")
        p2 = await make_project(db_session, agency=agency, created_by=owner, name="Beta")

        # Two tasks for me in p1 (one moved to the last column = done), one for
        # someone else, one for me in p2.
        mine_open = await make_task(db_session, project=p1, title="My open task")
        mine_done = await make_task(db_session, project=p1, title="My done task")
        theirs = await make_task(db_session, project=p1, title="Not mine")
        mine_p2 = await make_task(db_session, project=p2, title="My other project task")

        board = await get_project_board(db_session, p1.id)
        done_list = board[-1][0]

        mine_open.assignee_id = me.id
        mine_done.assignee_id = me.id
        mine_done.list_id = done_list.id
        theirs.assignee_id = owner.id
        mine_p2.assignee_id = me.id
        await db_session.commit()

        result = await service.my_work(db_session, agency.id, me.id)

        titles = {t.title for t in result.tasks}
        assert titles == {"My open task", "My other project task"}
        assert result.total_open == 2
        # project + client names are joined in
        assert {t.project_name for t in result.tasks} == {"Alpha", "Beta"}
        assert all(t.client_name for t in result.tasks)

    async def test_overdue_and_due_soon_counts(self, db_session) -> None:
        owner = await make_user(db_session)
        me = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=me)
        project = await make_project(db_session, agency=agency, created_by=owner)

        today = datetime.now(UTC).date()
        overdue = await make_task(db_session, project=project, title="Overdue")
        soon = await make_task(db_session, project=project, title="Soon")
        later = await make_task(db_session, project=project, title="Later")
        dues = (
            (overdue, today - timedelta(days=2)),
            (soon, today + timedelta(days=3)),
            (later, today + timedelta(days=30)),
        )
        for task, due in dues:
            task.due_date = due
            task.assignee_id = me.id
        await db_session.commit()

        result = await service.my_work(db_session, agency.id, me.id)
        assert result.overdue_count == 1
        assert result.due_soon_count == 1
        assert result.total_open == 3
        # overdue task sorts first (earliest due date)
        assert result.tasks[0].title == "Overdue"
        assert result.tasks[0].overdue is True

    async def test_empty_when_nothing_assigned(self, db_session) -> None:
        owner = await make_user(db_session)
        me = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=me)
        await make_project(db_session, agency=agency, created_by=owner)

        result = await service.my_work(db_session, agency.id, me.id)
        assert result.tasks == []
        assert result.total_open == 0

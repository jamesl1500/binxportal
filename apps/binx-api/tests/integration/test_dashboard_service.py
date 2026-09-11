"""Integration tests for the dashboard module's aggregation reads:
``service.my_work`` (cross-project "assigned to me, not done" tasks) and
``service.overview`` (the Overview tab's single-call rollup)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

from binx_api.modules.activity.service import log_agency_activity
from binx_api.modules.dashboard import service
from binx_api.modules.invoicing.service import issue_invoice
from binx_api.modules.projects.service import get_project_board
from tests.factories import (
    add_agency_member,
    make_agency,
    make_conversation,
    make_invoice,
    make_project,
    make_task,
    make_user,
)

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


class TestOverview:
    async def test_composes_every_section(self, db_session) -> None:
        owner = await make_user(db_session)
        me = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=me, role="member")

        active_project = await make_project(db_session, agency=agency, created_by=owner, status="active")
        on_hold_project = await make_project(db_session, agency=agency, created_by=owner, status="on_hold")

        task = await make_task(db_session, project=active_project, title="Assigned to me")
        task.assignee_id = me.id

        invoice = await make_invoice(db_session, agency=agency, created_by=owner)
        await issue_invoice(db_session, invoice, issued_by=owner)
        invoice.due_date = date.today() - timedelta(days=3)

        await log_agency_activity(
            db_session, agency.id, category="team", event_type="member_joined", summary="Someone joined", actor=owner
        )

        conversation = await make_conversation(
            db_session, agency=agency, creator=owner, others=[me], initial_message="Hello team"
        )
        await db_session.commit()

        overview = await service.overview(db_session, agency, me, viewer_is_admin=False)

        assert overview.projects_total == 2
        assert overview.projects_active == 1
        assert [p.id for p in overview.on_hold_projects] == [on_hold_project.id]

        assert overview.clients_total >= 1

        assert overview.invoice_summary.overdue_count == 1
        assert len(overview.overdue_invoices) == 1
        assert overview.overdue_invoices[0].id == invoice.id

        assert overview.unread_messages == 1
        assert conversation.id is not None  # sanity: conversation was created

        assert overview.my_work.total_open == 1
        assert overview.my_work.tasks[0].title == "Assigned to me"

        # Other service calls above (create_project, create_invoice, ...) log
        # their own activity too — just check ours made it into the rollup,
        # capped at RECENT_ACTIVITY_LIMIT.
        assert len(overview.recent_activity) <= service.RECENT_ACTIVITY_LIMIT
        assert "Someone joined" in {entry.summary for entry in overview.recent_activity}

    async def test_caps_on_hold_and_overdue_lists(self, db_session) -> None:
        owner = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)

        for i in range(service.ON_HOLD_PROJECTS_LIMIT + 2):
            await make_project(db_session, agency=agency, created_by=owner, name=f"On hold {i}", status="on_hold")
        for _i in range(service.OVERDUE_INVOICES_LIMIT + 2):
            invoice = await make_invoice(db_session, agency=agency, created_by=owner)
            await issue_invoice(db_session, invoice, issued_by=owner)
            invoice.due_date = date.today() - timedelta(days=1)
        await db_session.commit()

        overview = await service.overview(db_session, agency, owner, viewer_is_admin=True)

        assert overview.projects_total == service.ON_HOLD_PROJECTS_LIMIT + 2
        assert len(overview.on_hold_projects) == service.ON_HOLD_PROJECTS_LIMIT
        assert len(overview.overdue_invoices) == service.OVERDUE_INVOICES_LIMIT
        assert overview.invoice_summary.overdue_count == service.OVERDUE_INVOICES_LIMIT + 2

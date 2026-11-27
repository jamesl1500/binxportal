"""
End-to-end: importing leads, projects, tasks and time entries, exporting
every kind (CSV and XLSX), templates, and the export → import round trip.
"""

from __future__ import annotations

import csv
import io

import openpyxl
import pytest
from sqlalchemy import select

from binx_api.modules.activity.models import ActivityLog
from binx_api.modules.leads.models import Lead
from binx_api.modules.notifications.models import Notification
from binx_api.modules.projects.models import Project, ProjectTask, ProjectTaskList
from binx_api.modules.time_tracking.models import TimeEntry
from binx_api.modules.users.models import UserPrivacySettings
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_client, make_project, make_task, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def agency(db_session, user):
    return await make_agency(db_session, owner=user, name="Data Agency")


async def _import(client, user, agency, kind: str, rows: list[dict], *, dry_run: bool = False) -> dict:
    response = await client.post(
        f"/agencies/{agency.id}/imports/{kind}", json={"rows": rows, "dry_run": dry_run}, headers=auth_headers(user)
    )
    assert response.status_code == 200, response.text
    return response.json()


def _statuses(result: dict) -> list[str]:
    return [row["status"] for row in result["rows"]]


def _csv_rows(content: bytes) -> list[list[str]]:
    return list(csv.reader(io.StringIO(content.decode("utf-8-sig"))))


class TestLeadImport:
    async def test_imports_leads_with_status_value_and_dedupes(self, client, user, db_session, agency) -> None:
        rows = [
            {
                "row": 2,
                "name": "Northwind",
                "estimated_value": "$15,000",
                "status": "Qualified",
                "contact_email": "a@n.co",
            },
            {"row": 3, "name": "northwind"},  # same name as row 2
            {"row": 4, "name": "Bad Status", "status": "maybe"},
            {"row": 5, "name": "Bad Value", "estimated_value": "lots"},
            {"row": 6, "name": "Contoso", "contact_email": "A@N.CO"},  # same email as row 2
        ]
        review = await _import(client, user, agency, "leads", rows, dry_run=True)
        assert _statuses(review) == ["ok", "duplicate", "invalid", "invalid", "duplicate"]
        assert "Estimated value" in review["rows"][3]["message"]
        assert (await db_session.execute(select(Lead))).scalars().all() == []

        result = await _import(client, user, agency, "leads", rows)
        assert result["imported"] == 1
        lead = (await db_session.execute(select(Lead).where(Lead.agency_id == agency.id))).scalar_one()
        assert (lead.name, lead.status, lead.estimated_value_cents, lead.source) == (
            "Northwind",
            "qualified",
            1_500_000,
            "import",
        )
        assert lead.owner_id == user.id


class TestProjectImport:
    async def test_projects_need_an_existing_client(self, client, user, db_session, agency) -> None:
        await make_client(db_session, agency=agency, name="Acme Co")
        rows = [
            {"row": 2, "name": "Site", "client": "acme co", "status": "On hold", "due_date": "3/31/2026"},
            {"row": 3, "name": "Other", "client": "Nobody Inc"},
            {"row": 4, "name": "Late", "client": "Acme Co", "start_date": "2026-05-01", "due_date": "2026-04-01"},
            {"row": 5, "name": "SITE", "client": "Acme Co"},
        ]
        result = await _import(client, user, agency, "projects", rows)
        assert _statuses(result) == ["ok", "invalid", "invalid", "duplicate"]
        assert "No client named" in result["rows"][1]["message"]

        project = (await db_session.execute(select(Project).where(Project.agency_id == agency.id))).scalar_one()
        assert (project.name, project.status, project.due_date.isoformat()) == ("Site", "on_hold", "2026-03-31")
        columns = await db_session.execute(select(ProjectTaskList).where(ProjectTaskList.project_id == project.id))
        assert len(columns.scalars().all()) == 3  # the default board, as if made by hand
        # One summary activity entry for the batch, not one per project.
        summaries = (await db_session.execute(select(ActivityLog.event_type))).scalars().all()
        assert "projects_imported" in summaries
        assert "project_created" not in summaries


class TestTaskImport:
    async def test_tasks_land_in_named_columns_and_new_columns_are_created(
        self, client, user, db_session, agency
    ) -> None:
        teammate = await make_user(db_session, email="tess@example.com", full_name="Tess Mate")
        await add_agency_member(db_session, agency=agency, user=teammate)
        project = await make_project(db_session, agency=agency, created_by=user, name="Launch")
        await make_task(db_session, project=project, title="Existing")
        rows = [
            {
                "row": 2,
                "project": "Launch",
                "title": "Write copy",
                "column": "in progress",
                "assignee": "TESS@example.com",
            },
            {"row": 3, "project": "Launch", "title": "QA pass", "column": "Review", "assignee": "tess@example.com"},
            {"row": 4, "project": "Launch", "title": "existing"},
            {"row": 5, "project": "Launch", "title": "Ghost", "assignee": "nobody@example.com"},
            {"row": 6, "project": "Nope", "title": "Lost"},
        ]
        review = await _import(client, user, agency, "tasks", rows, dry_run=True)
        assert _statuses(review) == ["ok", "ok", "duplicate", "invalid", "invalid"]
        assert review["rows"][1]["message"] == "Adds a new column “Review” to Launch"

        await _import(client, user, agency, "tasks", rows)
        board = await db_session.execute(
            select(ProjectTaskList.name, ProjectTask.title)
            .join(ProjectTask, ProjectTask.list_id == ProjectTaskList.id)
            .where(ProjectTaskList.project_id == project.id)
        )
        placed = set(board.all())
        assert ("In Progress", "Write copy") in placed
        assert ("Review", "QA pass") in placed

        notes = (await db_session.execute(select(Notification).where(Notification.user_id == teammate.id))).scalars()
        assert [n.title for n in notes] == ["Alice Anderson assigned you 2 tasks"]  # one per batch


class TestTimeEntryImport:
    async def test_owner_imports_for_anyone_and_member_only_for_themselves(
        self, client, user, db_session, agency
    ) -> None:
        member = await make_user(db_session, email="mo@example.com", full_name="Mo Member")
        await add_agency_member(db_session, agency=agency, user=member)
        project = await make_project(db_session, agency=agency, created_by=user, name="Retainer")
        await make_task(db_session, project=project, title="Design")
        rows = [
            {
                "row": 2,
                "date": "2026-01-12",
                "hours": "1:30",
                "project": "Retainer",
                "task": "design",
                "member": "mo@example.com",
            },
            {
                "row": 3,
                "date": "2026-01-12",
                "hours": "1:30",
                "project": "Retainer",
                "task": "Design",
                "member": "mo@example.com",
            },
            {"row": 4, "date": "2026-01-13", "hours": "26", "project": "Retainer"},
            {"row": 5, "date": "2026-01-14", "hours": "2", "project": "Retainer", "billable": "no"},
        ]
        result = await _import(client, user, agency, "time_entries", rows)
        assert _statuses(result) == ["ok", "duplicate", "invalid", "ok"]
        entries = (await db_session.execute(select(TimeEntry).order_by(TimeEntry.started_at))).scalars().all()
        assert [(e.user_id, e.duration_minutes, e.is_billable) for e in entries] == [
            (member.id, 90, True),
            (user.id, 120, False),
        ]
        assert entries[0].started_at.hour == 12  # date-only entries start at noon UTC

        # A member can't import someone else's time.
        denied = await _import(
            client,
            member,
            agency,
            "time_entries",
            [{"row": 2, "date": "2026-02-01", "hours": "1", "project": "Retainer", "member": "alice@example.com"}],
        )
        assert _statuses(denied) == ["invalid"]
        assert "only import their own time" in denied["rows"][0]["message"]


class TestExports:
    @pytest.mark.parametrize(
        "kind", ["clients", "team", "leads", "projects", "tasks", "time_entries", "invoices", "proposals", "services"]
    )
    async def test_every_kind_exports_as_csv_and_xlsx(self, client, user, agency, kind: str) -> None:
        for file_format, media_type in (("csv", "text/csv"), ("xlsx", "spreadsheetml")):
            response = await client.get(
                f"/agencies/{agency.id}/exports/{kind}?format={file_format}", headers=auth_headers(user)
            )
            assert response.status_code == 200, response.text
            assert media_type in response.headers["content-type"]
            assert response.headers["content-disposition"].startswith("attachment;")

    async def test_exports_are_logged_for_admins(self, client, user, db_session, agency) -> None:
        await client.get(f"/agencies/{agency.id}/exports/clients", headers=auth_headers(user))
        entry = (
            await db_session.execute(select(ActivityLog).where(ActivityLog.event_type == "clients_exported"))
        ).scalar_one()
        assert entry.visibility == "admin"

    async def test_formula_like_values_are_neutralized(self, client, user, db_session, agency) -> None:
        await _import(client, user, agency, "leads", [{"row": 2, "name": '=HYPERLINK("http://evil")'}])
        response = await client.get(f"/agencies/{agency.id}/exports/leads", headers=auth_headers(user))
        assert _csv_rows(response.content)[1][0] == '\'=HYPERLINK("http://evil")'

    async def test_team_export_respects_privacy_and_admin_only_fields(self, client, user, db_session, agency) -> None:
        shy = await make_user(db_session, email="shy@example.com", full_name="Shy Person")
        await add_agency_member(db_session, agency=agency, user=shy)
        member = await make_user(db_session, email="peer@example.com", full_name="Peer")
        await add_agency_member(db_session, agency=agency, user=member)
        db_session.add(UserPrivacySettings(user_id=shy.id, show_email_to_team=False))
        await db_session.commit()

        as_member = _csv_rows(
            (await client.get(f"/agencies/{agency.id}/exports/team", headers=auth_headers(member))).content
        )
        assert "Admin notes" not in as_member[0]
        shy_row = next(row for row in as_member if row[2] == "Shy Person")
        assert shy_row[0] == ""  # email hidden from teammates

        as_owner = _csv_rows(
            (await client.get(f"/agencies/{agency.id}/exports/team", headers=auth_headers(user))).content
        )
        assert "Admin notes" in as_owner[0]
        assert next(row for row in as_owner if row[2] == "Shy Person")[0] == "shy@example.com"

    async def test_an_export_re_imports_with_every_column_matched(self, client, user, db_session, agency) -> None:
        await _import(
            client,
            user,
            agency,
            "leads",
            [{"row": 2, "name": "Round Trip", "estimated_value": "1200", "status": "contacted"}],
        )
        exported = await client.get(f"/agencies/{agency.id}/exports/leads?format=xlsx", headers=auth_headers(user))

        other = await make_agency(db_session, owner=user, name="Second Agency")
        parsed = await client.post(
            f"/agencies/{other.id}/imports/leads/parse",
            files={"file": ("leads.xlsx", exported.content, "application/octet-stream")},
            headers=auth_headers(user),
        )
        body = parsed.json()
        assert all(column is not None for column in body["mapping"].values())  # every field auto-matched

        mapping = body["mapping"]
        rows = [
            {"row": r["row"], **{key: (r["cells"][col] if col is not None else None) for key, col in mapping.items()}}
            for r in body["rows"]
        ]
        result = await _import(client, user, other, "leads", rows)
        assert result["imported"] == 1
        copy = (await db_session.execute(select(Lead).where(Lead.agency_id == other.id))).scalar_one()
        assert (copy.name, copy.estimated_value_cents, copy.status) == ("Round Trip", 120_000, "contacted")


class TestTemplates:
    @pytest.mark.parametrize("kind", ["clients", "team", "leads", "projects", "tasks", "time_entries", "services"])
    async def test_templates_auto_map_every_field(self, client, user, agency, kind: str) -> None:
        template = await client.get(
            f"/agencies/{agency.id}/imports/{kind}/template?format=xlsx", headers=auth_headers(user)
        )
        assert template.status_code == 200
        parsed = await client.post(
            f"/agencies/{agency.id}/imports/{kind}/parse",
            files={"file": (f"{kind}.xlsx", template.content, "application/octet-stream")},
            headers=auth_headers(user),
        )
        assert parsed.status_code == 200, parsed.text
        assert all(column is not None for column in parsed.json()["mapping"].values())

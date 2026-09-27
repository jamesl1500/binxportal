"""End-to-end: staff build a project kickoff (from scratch, and from a
reusable template), send it to the client's portal contact, the contact
answers it there, and staff convert the completed answers into project
tasks."""

from __future__ import annotations

import pytest

from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_project, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner", email="olivia@agency.example")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    client = await make_client(db_session, agency=agency, name="Northwind Traders")
    project = await make_project(db_session, agency=agency, created_by=owner, client=client, name="Rebrand")
    contact_user = await make_user(db_session, full_name="Casey Client", email="casey@northwind.example")
    await make_client_contact(db_session, agency=agency, client=client, user=contact_user, is_primary=True)
    return {"owner": owner, "agency": agency, "client": client, "project": project, "contact": contact_user}


class TestKickoffLifecycle:
    async def test_create_send_answer_convert(self, client, db_session, email_outbox, ctx) -> None:
        agency, owner, project, contact = ctx["agency"], ctx["owner"], ctx["project"], ctx["contact"]

        create = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/kickoff",
            json={
                "title": "Rebrand kickoff",
                "intro_message": "A few questions before we start.",
                "questions": [
                    {"type": "text", "label": "What's the main goal?", "required": True},
                    {
                        "type": "multiple_choice",
                        "label": "Preferred contact method?",
                        "options": ["Email", "Slack"],
                        "required": True,
                    },
                    {"type": "text", "label": "Anything else?", "required": False},
                ],
            },
            headers=auth_headers(owner),
        )
        assert create.status_code == 201, create.text
        kickoff = create.json()
        assert kickoff["status"] == "draft"
        assert len(kickoff["questions"]) == 3

        # The client can't see it yet — it's still a draft.
        pre_send = await client.get(f"/portal/projects/{project.id}/kickoff", headers=auth_headers(contact))
        assert pre_send.status_code == 404

        send = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/kickoff/send", headers=auth_headers(owner)
        )
        assert send.status_code == 200, send.text
        assert send.json()["status"] == "sent"
        assert len(email_outbox) == 1
        assert email_outbox[-1].to == "casey@northwind.example"

        proj_after_send = await client.get(f"/agencies/{agency.id}/projects/{project.id}", headers=auth_headers(owner))
        assert proj_after_send.json()["status"] == "waiting_on_client"

        portal_view = await client.get(f"/portal/projects/{project.id}/kickoff", headers=auth_headers(contact))
        assert portal_view.status_code == 200
        questions = portal_view.json()["questions"]
        text_q = next(q for q in questions if q["type"] == "text" and "main goal" in q["label"])
        mc_q = next(q for q in questions if q["type"] == "multiple_choice")
        optional_q = next(q for q in questions if q["required"] is False)

        # Skipping a required question is refused.
        incomplete = await client.post(
            f"/portal/projects/{project.id}/kickoff/answers",
            json={"answers": [{"question_id": str(text_q["id"]), "text_value": "Launch a new site"}]},
            headers=auth_headers(contact),
        )
        assert incomplete.status_code == 400

        submit = await client.post(
            f"/portal/projects/{project.id}/kickoff/answers",
            json={
                "answers": [
                    {"question_id": str(text_q["id"]), "text_value": "Launch a new site"},
                    {"question_id": str(mc_q["id"]), "selected_options": ["Email"]},
                ]
            },
            headers=auth_headers(contact),
        )
        assert submit.status_code == 200, submit.text
        assert submit.json()["status"] == "completed"
        answered_ids = {a["question_id"] for a in submit.json()["answers"]}
        assert answered_ids == {text_q["id"], mc_q["id"]}
        assert optional_q["id"] not in answered_ids

        proj_after_submit = await client.get(
            f"/agencies/{agency.id}/projects/{project.id}", headers=auth_headers(owner)
        )
        assert proj_after_submit.json()["status"] == "active"

        convert = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/kickoff/convert", json={}, headers=auth_headers(owner)
        )
        assert convert.status_code == 200, convert.text
        assert convert.json()["tasks_created"] == 2  # only the two answered questions

        board = await client.get(f"/agencies/{agency.id}/projects/{project.id}/board", headers=auth_headers(owner))
        titles = [t["title"] for column in board.json() for t in column["tasks"]]
        assert "What's the main goal?" in titles

        # A second convert is refused.
        again = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/kickoff/convert", json={}, headers=auth_headers(owner)
        )
        assert again.status_code == 409

    async def test_send_without_portal_contact_is_refused(self, client, db_session, ctx) -> None:
        agency, owner = ctx["agency"], ctx["owner"]
        client2 = await make_client(db_session, agency=agency, name="No Contact Co")
        project2 = await make_project(db_session, agency=agency, created_by=owner, client=client2, name="Solo")

        create = await client.post(
            f"/agencies/{agency.id}/projects/{project2.id}/kickoff",
            json={"title": "Kickoff", "questions": [{"type": "text", "label": "Q1"}]},
            headers=auth_headers(owner),
        )
        assert create.status_code == 201

        send = await client.post(
            f"/agencies/{agency.id}/projects/{project2.id}/kickoff/send", headers=auth_headers(owner)
        )
        assert send.status_code == 409

    async def test_template_seeds_kickoff_questions(self, client, db_session, ctx) -> None:
        agency, owner, project = ctx["agency"], ctx["owner"], ctx["project"]

        template = await client.post(
            f"/agencies/{agency.id}/kickoff-templates",
            json={
                "name": "Standard discovery",
                "description": "Default questions for every new project",
                "questions": [
                    {"type": "text", "label": "Brand guidelines link?", "required": False},
                    {"type": "file_upload", "label": "Upload your logo", "required": True},
                ],
            },
            headers=auth_headers(owner),
        )
        assert template.status_code == 201, template.text

        create = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/kickoff",
            json={"title": "From template", "template_id": template.json()["id"]},
            headers=auth_headers(owner),
        )
        assert create.status_code == 201, create.text
        labels = {q["label"] for q in create.json()["questions"]}
        assert labels == {"Brand guidelines link?", "Upload your logo"}

    async def test_only_one_kickoff_per_project(self, client, db_session, ctx) -> None:
        agency, owner, project = ctx["agency"], ctx["owner"], ctx["project"]
        first = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/kickoff",
            json={"title": "Kickoff", "questions": [{"type": "text", "label": "Q1"}]},
            headers=auth_headers(owner),
        )
        assert first.status_code == 201

        second = await client.post(
            f"/agencies/{agency.id}/projects/{project.id}/kickoff",
            json={"title": "Another", "questions": [{"type": "text", "label": "Q2"}]},
            headers=auth_headers(owner),
        )
        assert second.status_code == 409

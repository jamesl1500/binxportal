"""
End-to-end tests for the notifications surface: a couple of the real producers
(agency invite accepted, task assigned) land a notification for the right
person, the ``/notifications`` endpoints drive the dropdown, and a muted
category is honoured.
"""

from __future__ import annotations

import pytest

from binx_api.modules.projects import service as projects_service
from tests.conftest import auth_headers, extract_token
from tests.factories import add_agency_member, make_agency, make_client, make_user

pytestmark = pytest.mark.e2e


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(projects_service.settings, "project_upload_dir", str(tmp_path))


class TestInviteAcceptedProducer:
    async def test_the_inviter_is_notified_when_an_invite_is_accepted(
        self, client, user, other_user, email_outbox
    ) -> None:
        owner_headers = auth_headers(user)
        agency_id = (await client.post("/agencies", json={"name": "Notify Co"}, headers=owner_headers)).json()["id"]
        await client.post(
            f"/agencies/{agency_id}/invitations",
            json={"email": other_user.email, "role": "member"},
            headers=owner_headers,
        )
        token = extract_token(email_outbox[-1].body)
        await client.post("/agencies/invitations/accept", json={"token": token}, headers=auth_headers(other_user))

        listing = (await client.get("/notifications", headers=owner_headers)).json()
        assert listing["unread_count"] == 1
        assert listing["items"][0]["category"] == "team"
        assert other_user.full_name in listing["items"][0]["title"]
        assert listing["items"][0]["link"] == "/team"

        # The accepter isn't notified about their own action.
        assert (await client.get("/notifications", headers=auth_headers(other_user))).json()["unread_count"] == 0


class TestTaskAssignedProducer:
    async def test_the_assignee_is_notified_and_a_mute_suppresses_it(self, client, db_session, user) -> None:
        agency = await make_agency(db_session, owner=user)
        teammate = await make_user(db_session, full_name="Terry Teammate")
        await add_agency_member(db_session, agency=agency, user=teammate)
        client_row = await make_client(db_session, agency=agency)
        project = await projects_service.create_project(
            db_session,
            agency,
            created_by=user,
            client_id=client_row.id,
            name="Launch",
            description=None,
            status_="active",
            start_date=None,
            due_date=None,
        )
        base = f"/agencies/{agency.id}/projects/{project.id}"
        owner_headers = auth_headers(user)
        board = (await client.get(f"{base}/board", headers=owner_headers)).json()
        todo_id = board[0]["id"]

        created = await client.post(
            f"{base}/tasks",
            json={"list_id": todo_id, "title": "Ship it", "assignee_id": str(teammate.id)},
            headers=owner_headers,
        )
        assert created.status_code == 201

        listing = (await client.get("/notifications", headers=auth_headers(teammate))).json()
        assert listing["unread_count"] == 1
        note = listing["items"][0]
        assert note["category"] == "projects"
        assert note["link"] == f"/projects/{project.id}"

        # Mark it read -> the count drops.
        await client.post(f"/notifications/{note['id']}/read", headers=auth_headers(teammate))
        assert (await client.get("/notifications/unread-count", headers=auth_headers(teammate))).json()[
            "unread_count"
        ] == 0

        # Mute the projects category, assign another task -> nothing new.
        settings_body = (await client.get("/users/me/notification-settings", headers=auth_headers(teammate))).json()
        settings_body["inapp_projects"] = False
        await client.put("/users/me/notification-settings", json=settings_body, headers=auth_headers(teammate))
        await client.post(
            f"{base}/tasks",
            json={"list_id": todo_id, "title": "Another", "assignee_id": str(teammate.id)},
            headers=owner_headers,
        )
        assert (await client.get("/notifications/unread-count", headers=auth_headers(teammate))).json()[
            "unread_count"
        ] == 0


class TestReadAll:
    async def test_mark_all_read_zeroes_the_count(self, client, db_session, user) -> None:
        agency = await make_agency(db_session, owner=user)
        teammate = await make_user(db_session)
        await add_agency_member(db_session, agency=agency, user=teammate)
        client_row = await make_client(db_session, agency=agency)
        project = await projects_service.create_project(
            db_session,
            agency,
            created_by=user,
            client_id=client_row.id,
            name="P",
            description=None,
            status_="active",
            start_date=None,
            due_date=None,
        )
        base = f"/agencies/{agency.id}/projects/{project.id}"
        owner_headers = auth_headers(user)
        todo_id = (await client.get(f"{base}/board", headers=owner_headers)).json()[0]["id"]
        for title in ("a", "b"):
            await client.post(
                f"{base}/tasks",
                json={"list_id": todo_id, "title": title, "assignee_id": str(teammate.id)},
                headers=owner_headers,
            )

        assert (await client.get("/notifications/unread-count", headers=auth_headers(teammate))).json()[
            "unread_count"
        ] == 2
        await client.post("/notifications/read-all", headers=auth_headers(teammate))
        assert (await client.get("/notifications/unread-count", headers=auth_headers(teammate))).json()[
            "unread_count"
        ] == 0

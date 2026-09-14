"""
End-to-end tests for the ``/agencies/{id}/projects`` router.

The headline journey: create a project, work its board, attach a file to a
task, and confirm that file shows up in the project-wide Files list and
*can't* be deleted from there (it's owned by the task).
"""

from __future__ import annotations

import pytest

from binx_api.modules.projects import service
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client

pytestmark = pytest.mark.e2e

PNG = ("hero.png", b"\x89PNG\r\n\x1a\nfake", "image/png")


@pytest.fixture
async def project(db_session, user):
    """A project owned by the ``user`` fixture, plus an isolated upload dir."""
    agency = await make_agency(db_session, owner=user)
    client_row = await make_client(db_session, agency=agency)
    proj = await service.create_project(
        db_session,
        agency,
        created_by=user,
        client_id=client_row.id,
        name="Launch Site",
        description=None,
        status_="active",
        start_date=None,
        due_date=None,
    )
    return agency, proj


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(service.settings, "project_upload_dir", str(tmp_path))


class TestBoardJourney:
    async def test_create_list_task_and_move_it(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"

        board = (await client.get(f"{base}/board", headers=headers)).json()
        assert [col["name"] for col in board] == ["To Do", "In Progress", "Done"]
        todo_id, doing_id = board[0]["id"], board[1]["id"]

        task = await client.post(
            f"{base}/tasks", json={"list_id": todo_id, "title": "Wire up analytics"}, headers=headers
        )
        assert task.status_code == 201
        task_id = task.json()["id"]

        moved = await client.patch(
            f"{base}/tasks/{task_id}/move", json={"list_id": doing_id, "position": 0}, headers=headers
        )
        assert moved.status_code == 200
        assert moved.json()["list_id"] == doing_id

        done_id = board[2]["id"]
        moved_list = await client.patch(f"{base}/task-lists/{done_id}/move", json={"position": 0}, headers=headers)
        assert moved_list.status_code == 200
        assert moved_list.json()["position"] == 0

        reordered = (await client.get(f"{base}/board", headers=headers)).json()
        assert [col["id"] for col in reordered] == [done_id, todo_id, doing_id]

    async def test_roles_and_tags_round_trip(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"

        role = await client.post(f"{base}/roles", json={"name": "Project Manager", "color": "#2563eb"}, headers=headers)
        assert role.status_code == 201

        tag = await client.post(f"{base}/tags", json={"name": "Bug", "color": "#dc2626"}, headers=headers)
        assert tag.status_code == 201
        tag_id = tag.json()["id"]

        board = (await client.get(f"{base}/board", headers=headers)).json()
        task = await client.post(
            f"{base}/tasks", json={"list_id": board[0]["id"], "title": "Squash it"}, headers=headers
        )
        task_id = task.json()["id"]

        tagged = await client.put(f"{base}/tasks/{task_id}/tags", json={"tag_ids": [tag_id]}, headers=headers)
        assert [t["name"] for t in tagged.json()["tags"]] == ["Bug"]


class TestProjectCrudAndMembers:
    async def test_create_read_update_delete_a_project(self, client, user, db_session) -> None:
        from tests.factories import make_agency
        from tests.factories import make_client as _make_client

        headers = auth_headers(user)
        agency = await make_agency(db_session, owner=user, name="CRUD Agency")
        client_row = await _make_client(db_session, agency=agency)
        base = f"/agencies/{agency.id}/projects"

        created = await client.post(
            base,
            json={"name": "Fresh Project", "client_id": str(client_row.id), "status": "planning"},
            headers=headers,
        )
        assert created.status_code == 201
        project_id = created.json()["id"]
        assert created.json()["member_count"] == 0  # count on read, not create

        read = await client.get(f"{base}/{project_id}", headers=headers)
        assert read.json()["member_count"] == 1  # the creator

        updated = await client.patch(
            f"{base}/{project_id}",
            json={"name": "Renamed Project", "client_id": str(client_row.id), "status": "active"},
            headers=headers,
        )
        assert updated.json()["status"] == "active"

        assert (await client.delete(f"{base}/{project_id}", headers=headers)).status_code == 204
        assert (await client.get(f"{base}/{project_id}", headers=headers)).status_code == 404

    async def test_assign_a_project_role_to_a_member(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"

        role_id = (
            await client.post(f"{base}/roles", json={"name": "Tech Lead", "color": "#0891b2"}, headers=headers)
        ).json()["id"]
        members = (await client.get(f"{base}/members", headers=headers)).json()
        member_id = members[0]["id"]

        assigned = await client.patch(f"{base}/members/{member_id}", json={"role_id": role_id}, headers=headers)
        assert assigned.json()["role_name"] == "Tech Lead"

        cleared = await client.patch(f"{base}/members/{member_id}", json={"role_id": None}, headers=headers)
        assert cleared.json()["role_name"] is None

    async def test_comment_on_a_task_and_delete_it(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"
        board = (await client.get(f"{base}/board", headers=headers)).json()
        task_id = (
            await client.post(f"{base}/tasks", json={"list_id": board[0]["id"], "title": "Discuss"}, headers=headers)
        ).json()["id"]

        # multipart/form-data now (a comment can carry a file); no file here.
        posted = await client.post(
            f"{base}/tasks/{task_id}/comments", data={"body": "Looks good to me"}, headers=headers
        )
        assert posted.status_code == 201
        comment_id = posted.json()["id"]
        assert posted.json()["author_name"] == user.full_name
        assert posted.json()["attachment"] is None

        listed = await client.get(f"{base}/tasks/{task_id}/comments", headers=headers)
        assert [c["id"] for c in listed.json()] == [comment_id]

        deleted = await client.delete(f"{base}/tasks/{task_id}/comments/{comment_id}", headers=headers)
        assert deleted.status_code == 204

    async def test_comment_file_becomes_a_task_file_and_a_project_file(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"
        board = (await client.get(f"{base}/board", headers=headers)).json()
        task_id = (
            await client.post(f"{base}/tasks", json={"list_id": board[0]["id"], "title": "Review"}, headers=headers)
        ).json()["id"]

        name, content, mime = PNG
        posted = await client.post(
            f"{base}/tasks/{task_id}/comments",
            data={"body": "mockup attached"},
            files={"file": (name, content, mime)},
            headers=headers,
        )
        assert posted.status_code == 201
        attachment = posted.json()["attachment"]
        assert attachment["file_name"] == name
        assert attachment["task_id"] == task_id

        # It's a real task file: on the task's Files list and downloadable
        # through the task-file route.
        task_files = (await client.get(f"{base}/tasks/{task_id}/files", headers=headers)).json()
        assert [f["id"] for f in task_files] == [attachment["id"]]
        download = await client.get(f"{base}/tasks/{task_id}/files/{attachment['id']}/download", headers=headers)
        assert download.status_code == 200
        assert download.content == content

        # ...and therefore mirrored into the project-wide Files list.
        project_files = (await client.get(f"{base}/files", headers=headers)).json()
        assert len(project_files) == 1
        assert project_files[0]["source_task_id"] == task_id
        assert project_files[0]["file_name"] == name

        # Deleting the comment takes the file (and its mirror) with it.
        assert (
            await client.delete(f"{base}/tasks/{task_id}/comments/{posted.json()['id']}", headers=headers)
        ).status_code == 204
        assert (await client.get(f"{base}/tasks/{task_id}/files", headers=headers)).json() == []
        assert (await client.get(f"{base}/files", headers=headers)).json() == []

    async def test_comment_rejects_a_disallowed_attachment_type(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"
        board = (await client.get(f"{base}/board", headers=headers)).json()
        task_id = (
            await client.post(f"{base}/tasks", json={"list_id": board[0]["id"], "title": "x"}, headers=headers)
        ).json()["id"]

        response = await client.post(
            f"{base}/tasks/{task_id}/comments",
            data={"body": "bad file"},
            files={"file": ("notes.txt", b"plain text", "text/plain")},
            headers=headers,
        )
        assert response.status_code == 415
        assert (await client.get(f"{base}/tasks/{task_id}/comments", headers=headers)).json() == []


class TestTaskFileShowsUpInProjectFiles:
    async def test_upload_to_task_then_see_it_and_fail_to_delete_it_project_side(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"

        board = (await client.get(f"{base}/board", headers=headers)).json()
        task_id = (
            await client.post(
                f"{base}/tasks", json={"list_id": board[0]["id"], "title": "Design the hero"}, headers=headers
            )
        ).json()["id"]

        # Attach a file to the task.
        upload = await client.post(
            f"{base}/tasks/{task_id}/files",
            files={"file": PNG},
            headers=headers,
        )
        assert upload.status_code == 201

        # It shows up in the project-wide Files list, badged with the task.
        project_files = (await client.get(f"{base}/files", headers=headers)).json()
        assert len(project_files) == 1
        mirror = project_files[0]
        assert mirror["file_name"] == "hero.png"
        assert mirror["source_task_title"] == "Design the hero"

        # It can't be deleted from the project side.
        refused = await client.delete(f"{base}/files/{mirror['id']}", headers=headers)
        assert refused.status_code == 409

        # Deleting it from the task takes the mirror with it.
        task_files = (await client.get(f"{base}/tasks/{task_id}/files", headers=headers)).json()
        removed = await client.delete(f"{base}/tasks/{task_id}/files/{task_files[0]['id']}", headers=headers)
        assert removed.status_code == 204
        assert (await client.get(f"{base}/files", headers=headers)).json() == []

    async def test_task_file_rejects_a_disallowed_type_over_http(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"
        board = (await client.get(f"{base}/board", headers=headers)).json()
        task_id = (
            await client.post(f"{base}/tasks", json={"list_id": board[0]["id"], "title": "x"}, headers=headers)
        ).json()["id"]

        response = await client.post(
            f"{base}/tasks/{task_id}/files",
            files={"file": ("notes.txt", b"plain text", "text/plain")},
            headers=headers,
        )
        assert response.status_code == 415

    async def test_a_directly_uploaded_project_file_can_still_be_deleted(self, client, user, project) -> None:
        _agency, proj = project
        headers = auth_headers(user)
        base = f"/agencies/{proj.agency_id}/projects/{proj.id}"

        upload = await client.post(
            f"{base}/files", files={"file": ("proposal.pdf", b"%PDF-1.4 ...", "application/pdf")}, headers=headers
        )
        assert upload.status_code == 201
        file_id = upload.json()["id"]
        assert upload.json()["source_task_id"] is None

        assert (await client.delete(f"{base}/files/{file_id}", headers=headers)).status_code == 204

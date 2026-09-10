"""End-to-end tests for the project collaboration canvas: the staff endpoints
under a project, the mirrored client-portal endpoints, cross-side editing, and
the access/scoping boundaries.
"""

from __future__ import annotations

import io

import pytest

from binx_api.modules.messaging import realtime
from tests.conftest import auth_headers
from tests.factories import (
    add_agency_member,
    make_agency,
    make_client,
    make_client_contact,
    make_project,
    make_user,
)

pytestmark = pytest.mark.e2e

_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def accept(self) -> None:  # pragma: no cover
        pass

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)


@pytest.fixture(autouse=True)
def _fresh_manager(monkeypatch):
    from binx_api.modules.boards import service as boards_service

    monkeypatch.setattr(realtime, "manager", realtime.ConnectionManager())
    monkeypatch.setattr(boards_service.realtime, "manager", realtime.manager)


@pytest.fixture
async def canvas_ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    contact = await make_user(db_session, full_name="Casey Client", email="casey@client.example")
    agency = await make_agency(db_session, owner=owner, name="Pixel Forge")
    client = await make_client(db_session, agency=agency, name="Northwind")
    project = await make_project(db_session, agency=agency, created_by=owner, client=client, name="Rebrand")
    await make_client_contact(db_session, agency=agency, client=client, user=contact)
    return {"owner": owner, "contact": contact, "agency": agency, "client": client, "project": project}


def _staff_base(ctx) -> str:
    return f"/agencies/{ctx['agency'].id}/projects/{ctx['project'].id}/canvas"


class TestStaffCanvas:
    async def test_crud_and_image(self, client, canvas_ctx) -> None:
        ctx = canvas_ctx
        h = auth_headers(ctx["owner"])
        base = _staff_base(ctx)

        board = await client.get(base, headers=h)
        assert board.status_code == 200, board.text
        assert board.json()["items"] == []

        created = await client.post(
            f"{base}/items",
            json={"type": "note", "x": 40, "y": 60, "content": {"text": "kickoff ideas"}},
            headers=h,
        )
        assert created.status_code == 201, created.text
        item_id = created.json()["id"]
        assert created.json()["author_kind"] == "agency"
        assert created.json()["z"] == 1

        moved = await client.patch(f"{base}/items/{item_id}", json={"x": 200, "y": 90}, headers=h)
        assert moved.status_code == 200
        assert moved.json()["x"] == 200

        img = await client.post(
            f"{base}/images",
            files={"file": ("hero.png", io.BytesIO(_PNG), "image/png")},
            params={"x": 300, "y": 120, "width": 400, "height": 260},
            headers=h,
        )
        assert img.status_code == 201, img.text
        assert img.json()["type"] == "image"
        assert img.json()["content"]["file_id"]

        listing = (await client.get(base, headers=h)).json()["items"]
        assert {i["type"] for i in listing} == {"note", "image"}

        gone = await client.delete(f"{base}/items/{item_id}", headers=h)
        assert gone.status_code == 204
        assert [i["id"] for i in (await client.get(base, headers=h)).json()["items"]] == [img.json()["id"]]

    async def test_rejects_non_image_upload(self, client, canvas_ctx) -> None:
        ctx = canvas_ctx
        r = await client.post(
            f"{_staff_base(ctx)}/images",
            files={"file": ("x.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
            headers=auth_headers(ctx["owner"]),
        )
        assert r.status_code == 415


class TestPortalCanvas:
    async def test_client_sees_and_edits_the_same_board(self, client, canvas_ctx) -> None:
        ctx = canvas_ctx
        staff_h = auth_headers(ctx["owner"])
        client_h = auth_headers(ctx["contact"])
        staff_base = _staff_base(ctx)
        portal_base = f"/portal/projects/{ctx['project'].id}/canvas"

        # Staff drops a card...
        staff_item = (
            await client.post(
                f"{staff_base}/items", json={"type": "note", "content": {"text": "from the agency"}}, headers=staff_h
            )
        ).json()

        # ...the client sees it on the portal board and can move it.
        portal_board = await client.get(portal_base, headers=client_h)
        assert portal_board.status_code == 200, portal_board.text
        assert [i["id"] for i in portal_board.json()["items"]] == [staff_item["id"]]

        moved = await client.patch(f"{portal_base}/items/{staff_item['id']}", json={"x": 500}, headers=client_h)
        assert moved.status_code == 200
        assert moved.json()["x"] == 500

        # The client adds their own card — marked client-authored.
        client_item = await client.post(
            f"{portal_base}/items", json={"type": "note", "content": {"text": "client feedback"}}, headers=client_h
        )
        assert client_item.status_code == 201, client_item.text
        assert client_item.json()["author_kind"] == "client"
        assert client_item.json()["created_by_name"] == "Casey Client"

        # ...and staff sees it back on their side.
        staff_view = (await client.get(staff_base, headers=staff_h)).json()["items"]
        assert client_item.json()["id"] in {i["id"] for i in staff_view}

        # The client can delete the staff card (full collaboration).
        assert (await client.delete(f"{portal_base}/items/{staff_item['id']}", headers=client_h)).status_code == 204

    async def test_portal_image_bytes_round_trip(self, client, canvas_ctx) -> None:
        ctx = canvas_ctx
        client_h = auth_headers(ctx["contact"])
        portal_base = f"/portal/projects/{ctx['project'].id}/canvas"

        item = (
            await client.post(
                f"{portal_base}/images",
                files={"file": ("shot.png", io.BytesIO(_PNG), "image/png")},
                headers=client_h,
            )
        ).json()
        file_id = item["content"]["file_id"]

        got = await client.get(f"{portal_base}/images/{file_id}", headers=client_h)
        assert got.status_code == 200
        assert got.content == _PNG

    async def test_a_non_contact_is_forbidden(self, client, canvas_ctx, db_session) -> None:
        ctx = canvas_ctx
        stranger = await make_user(db_session, full_name="Stranger")
        r = await client.get(f"/portal/projects/{ctx['project'].id}/canvas", headers=auth_headers(stranger))
        assert r.status_code == 403

    async def test_a_contact_cannot_reach_another_clients_project(self, client, canvas_ctx, db_session) -> None:
        ctx = canvas_ctx
        other_client = await make_client(db_session, agency=ctx["agency"], name="Someone Else")
        other_project = await make_project(
            db_session, agency=ctx["agency"], created_by=ctx["owner"], client=other_client, name="Not Yours"
        )
        r = await client.get(f"/portal/projects/{other_project.id}/canvas", headers=auth_headers(ctx["contact"]))
        assert r.status_code == 404


class TestReactionsAndComments:
    async def test_reaction_toggle_and_board_meta(self, client, canvas_ctx) -> None:
        ctx = canvas_ctx
        staff_h = auth_headers(ctx["owner"])
        client_h = auth_headers(ctx["contact"])
        staff_base = _staff_base(ctx)
        portal_base = f"/portal/projects/{ctx['project'].id}/canvas"

        item = (
            await client.post(
                f"{staff_base}/items", json={"type": "note", "content": {"text": "idea"}}, headers=staff_h
            )
        ).json()
        assert item["reactions"] == {} and item["my_reactions"] == [] and item["comment_count"] == 0

        r = await client.post(f"{staff_base}/items/{item['id']}/reactions", json={"kind": "👍"}, headers=staff_h)
        assert r.status_code == 200, r.text
        assert r.json() == {"reactions": {"👍": 1}, "my_reactions": ["👍"]}

        # the client reacts too, from the portal
        r2 = await client.post(f"{portal_base}/items/{item['id']}/reactions", json={"kind": "👍"}, headers=client_h)
        assert r2.json()["reactions"] == {"👍": 2}
        assert r2.json()["my_reactions"] == ["👍"]

        # staff un-reacts
        r3 = await client.post(f"{staff_base}/items/{item['id']}/reactions", json={"kind": "👍"}, headers=staff_h)
        assert r3.json() == {"reactions": {"👍": 1}, "my_reactions": []}

        board = (await client.get(portal_base, headers=client_h)).json()
        card = next(i for i in board["items"] if i["id"] == item["id"])
        assert card["reactions"] == {"👍": 1}
        assert card["my_reactions"] == ["👍"]  # the client still has theirs

        bad = await client.post(f"{staff_base}/items/{item['id']}/reactions", json={"kind": "nope"}, headers=staff_h)
        assert bad.status_code == 400

    async def test_comment_crud_and_moderation(self, client, canvas_ctx) -> None:
        ctx = canvas_ctx
        staff_h = auth_headers(ctx["owner"])
        client_h = auth_headers(ctx["contact"])
        staff_base = _staff_base(ctx)
        portal_base = f"/portal/projects/{ctx['project'].id}/canvas"

        item = (
            await client.post(
                f"{staff_base}/items", json={"type": "note", "content": {"text": "review this"}}, headers=staff_h
            )
        ).json()

        staff_comment = await client.post(
            f"{staff_base}/items/{item['id']}/comments", json={"body": "looks good"}, headers=staff_h
        )
        assert staff_comment.status_code == 201, staff_comment.text
        assert staff_comment.json()["author_kind"] == "agency"

        client_comment = await client.post(
            f"{portal_base}/items/{item['id']}/comments", json={"body": "one tweak please"}, headers=client_h
        )
        assert client_comment.status_code == 201
        assert client_comment.json()["author_kind"] == "client"
        assert client_comment.json()["author_name"] == "Casey Client"

        listed = (await client.get(f"{portal_base}/items/{item['id']}/comments", headers=client_h)).json()
        assert [c["body"] for c in listed] == ["looks good", "one tweak please"]

        # the client can delete their own...
        assert (
            await client.delete(
                f"{portal_base}/items/{item['id']}/comments/{client_comment.json()['id']}", headers=client_h
            )
        ).status_code == 204
        # ...but not the agency's
        assert (
            await client.delete(
                f"{portal_base}/items/{item['id']}/comments/{staff_comment.json()['id']}", headers=client_h
            )
        ).status_code == 403
        # the agency owner moderates it away
        assert (
            await client.delete(
                f"{staff_base}/items/{item['id']}/comments/{staff_comment.json()['id']}", headers=staff_h
            )
        ).status_code == 204

        assert (await client.get(f"{staff_base}/items/{item['id']}/comments", headers=staff_h)).json() == []


class TestRealtime:
    async def test_staff_create_pushes_to_a_connected_client_contact(self, client, canvas_ctx) -> None:
        ctx = canvas_ctx
        sock = FakeSocket()
        await realtime.manager.connect(ctx["contact"].id, sock)

        await client.post(
            f"{_staff_base(ctx)}/items",
            json={"type": "note", "content": {"text": "live"}},
            headers=auth_headers(ctx["owner"]),
        )
        assert len(sock.sent) == 1
        assert sock.sent[0]["type"] == realtime.EVENT_BOARD_ITEM_CREATED
        assert sock.sent[0]["data"]["content"] == {"text": "live"}

"""Integration tests for ``binx_api.modules.boards.service`` — lazy board
creation, item CRUD + z-ordering, image validation + Files-tab mirror, and the
realtime fan-out to the team + client contacts.
"""

from __future__ import annotations

import json

import pytest
from sqlalchemy import select

from binx_api.modules.boards import service
from binx_api.modules.boards.models import BoardItem, ProjectBoard
from binx_api.modules.messaging import realtime
from binx_api.modules.notifications.models import Notification
from binx_api.modules.projects.service import list_project_files
from tests.factories import (
    add_agency_member,
    make_agency,
    make_client,
    make_client_contact,
    make_project,
    make_user,
)

pytestmark = pytest.mark.integration


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def accept(self) -> None:  # pragma: no cover
        pass

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)


@pytest.fixture(autouse=True)
def _fresh_manager(monkeypatch):
    monkeypatch.setattr(realtime, "manager", realtime.ConnectionManager())
    monkeypatch.setattr(service.realtime, "manager", realtime.manager)


async def _project(db):
    owner = await make_user(db)
    agency = await make_agency(db, owner=owner)
    client = await make_client(db, agency=agency)
    project = await make_project(db, agency=agency, created_by=owner, client=client)
    return owner, agency, client, project


class TestBoard:
    async def test_get_or_create_is_idempotent(self, db_session) -> None:
        _owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        again = await service.get_or_create_board(db_session, project)
        assert board.id == again.id
        assert isinstance(board, ProjectBoard)


class TestItems:
    async def test_create_stacks_z_and_broadcasts(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)

        sock = FakeSocket()
        await realtime.manager.connect(owner.id, sock)

        a = await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=10,
            y=20,
            width=None,
            height=None,
            content={"text": "first"},
            color=None,
        )
        b = await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=0,
            y=0,
            width=200,
            height=120,
            content={"text": "second"},
            color="#fef3c7",
        )
        assert b.z > a.z
        assert json.loads(a.content) == {"text": "first"}

        assert [e["type"] for e in sock.sent] == [
            realtime.EVENT_BOARD_ITEM_CREATED,
            realtime.EVENT_BOARD_ITEM_CREATED,
        ]
        assert sock.sent[0]["data"]["content"] == {"text": "first"}
        assert sock.sent[0]["board_id"] == str(board.id)

    async def test_update_only_touches_given_fields_and_notes_text(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        item = await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=10,
            y=10,
            width=None,
            height=None,
            content={"text": "hi"},
            color=None,
        )

        await service.update_item(db_session, item, project, x=99.5, content={"text": "changed"})
        await db_session.refresh(item)
        assert item.x == 99.5
        assert item.y == 10  # untouched
        assert json.loads(item.content) == {"text": "changed"}

    async def test_delete_broadcasts_the_id(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        item = await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=0,
            y=0,
            width=None,
            height=None,
            content={"text": "x"},
            color=None,
        )
        sock = FakeSocket()
        await realtime.manager.connect(owner.id, sock)

        await service.delete_item(db_session, item, project)
        assert sock.sent[-1]["type"] == realtime.EVENT_BOARD_ITEM_DELETED
        assert sock.sent[-1]["data"] == {"id": str(item.id)}
        assert (await db_session.get(BoardItem, item.id)) is None


class TestImages:
    async def test_rejects_non_image_mime(self, db_session) -> None:
        _owner, _agency, _client, project = await _project(db_session)
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await service.save_board_image(
                db_session,
                project,
                uploaded_by=await make_user(db_session),
                file_name="notes.pdf",
                content=b"%PDF-1.4",
                mime_type="application/pdf",
            )
        assert exc.value.status_code == 415

    async def test_image_also_lands_on_the_files_tab(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        stored = await service.save_board_image(
            db_session,
            project,
            uploaded_by=owner,
            file_name="hero.png",
            content=b"\x89PNG\r\n\x1a\n",
            mime_type="image/png",
        )
        files = await list_project_files(db_session, project.id)
        assert stored.id in {f.id for f, *_ in files}


class TestReactions:
    async def test_toggle_adds_then_removes_and_broadcasts(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        item = await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=0,
            y=0,
            width=None,
            height=None,
            content={"text": "x"},
            color=None,
        )
        sock = FakeSocket()
        await realtime.manager.connect(owner.id, sock)

        added, counts = await service.toggle_reaction(db_session, item, project, user=owner, kind="👍")
        assert added is True
        assert counts == {"👍": 1}
        assert sock.sent[-1]["type"] == realtime.EVENT_BOARD_REACTION
        assert sock.sent[-1]["data"]["reactions"] == {"👍": 1}

        added, counts = await service.toggle_reaction(db_session, item, project, user=owner, kind="👍")
        assert added is False
        assert counts == {}

    async def test_unknown_kind_is_rejected(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        item = await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=0,
            y=0,
            width=None,
            height=None,
            content={"text": "x"},
            color=None,
        )
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await service.toggle_reaction(db_session, item, project, user=owner, kind="not-an-emoji")
        assert exc.value.status_code == 400

    async def test_item_meta_aggregates(self, db_session) -> None:
        owner = await make_user(db_session)
        other = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=other)
        client = await make_client(db_session, agency=agency)
        project = await make_project(db_session, agency=agency, created_by=owner, client=client)
        board = await service.get_or_create_board(db_session, project)
        item = await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=0,
            y=0,
            width=None,
            height=None,
            content={"text": "x"},
            color=None,
        )
        await service.toggle_reaction(db_session, item, project, user=owner, kind="👍")
        await service.toggle_reaction(db_session, item, project, user=other, kind="👍")
        await service.toggle_reaction(db_session, item, project, user=other, kind="🎉")
        await service.add_comment(db_session, item, project, author=other, author_kind="agency", body="nice")

        meta = (await service.item_meta(db_session, [item.id], owner.id))[item.id]
        assert meta["reactions"] == {"👍": 2, "🎉": 1}
        assert meta["my_reactions"] == ["👍"]
        assert meta["comment_count"] == 1


class TestComments:
    async def test_add_broadcasts_and_notifies_the_card_author(self, db_session) -> None:
        author = await make_user(db_session, full_name="Card Author")
        commenter = await make_user(db_session, full_name="Commenter")
        agency = await make_agency(db_session, owner=author)
        await add_agency_member(db_session, agency=agency, user=commenter)
        client = await make_client(db_session, agency=agency)
        project = await make_project(db_session, agency=agency, created_by=author, client=client)
        board = await service.get_or_create_board(db_session, project)
        item = await service.create_item(
            db_session,
            board,
            project,
            actor=author,
            type_="note",
            x=0,
            y=0,
            width=None,
            height=None,
            content={"text": "x"},
            color=None,
        )
        sock = FakeSocket()
        await realtime.manager.connect(author.id, sock)

        comment = await service.add_comment(
            db_session, item, project, author=commenter, author_kind="agency", body="  needs work  "
        )
        assert comment.body == "needs work"
        assert sock.sent[-1]["type"] == realtime.EVENT_BOARD_COMMENT_CREATED

        rows = (await db_session.execute(select(Notification).where(Notification.user_id == author.id))).scalars().all()
        assert any(n.event_type == "canvas_comment" for n in rows)

    async def test_no_self_notification(self, db_session) -> None:
        author = await make_user(db_session)
        agency = await make_agency(db_session, owner=author)
        client = await make_client(db_session, agency=agency)
        project = await make_project(db_session, agency=agency, created_by=author, client=client)
        board = await service.get_or_create_board(db_session, project)
        item = await service.create_item(
            db_session,
            board,
            project,
            actor=author,
            type_="note",
            x=0,
            y=0,
            width=None,
            height=None,
            content={"text": "x"},
            color=None,
        )
        await service.add_comment(db_session, item, project, author=author, author_kind="agency", body="mine")
        rows = (await db_session.execute(select(Notification).where(Notification.user_id == author.id))).scalars().all()
        assert not any(n.event_type == "canvas_comment" for n in rows)

    async def test_delete_permissions(self, db_session) -> None:
        from fastapi import HTTPException

        owner = await make_user(db_session)
        member = await make_user(db_session)
        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=member)
        client = await make_client(db_session, agency=agency)
        project = await make_project(db_session, agency=agency, created_by=owner, client=client)
        board = await service.get_or_create_board(db_session, project)
        item = await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=0,
            y=0,
            width=None,
            height=None,
            content={"text": "x"},
            color=None,
        )
        c = await service.add_comment(db_session, item, project, author=member, author_kind="agency", body="hi")

        # another member can't
        with pytest.raises(HTTPException) as exc:
            await service.delete_comment(db_session, c, project, requested_by=owner, requester_role="member")
        assert exc.value.status_code == 403
        # ...but an owner/admin can moderate
        await service.delete_comment(db_session, c, project, requested_by=owner, requester_role="owner")
        assert await service.list_comments(db_session, item.id) == []


class TestBroadcastRecipients:
    async def test_reaches_team_and_client_contacts_only(self, db_session) -> None:
        owner = await make_user(db_session, full_name="Owner")
        teammate = await make_user(db_session, full_name="Teammate")
        contact_user = await make_user(db_session, full_name="Client Casey")
        outsider = await make_user(db_session, full_name="Outsider")

        agency = await make_agency(db_session, owner=owner)
        await add_agency_member(db_session, agency=agency, user=teammate)
        client = await make_client(db_session, agency=agency)
        await make_client_contact(db_session, agency=agency, client=client, user=contact_user)
        project = await make_project(db_session, agency=agency, created_by=owner, client=client)
        board = await service.get_or_create_board(db_session, project)

        socks = {}
        for u in (owner, teammate, contact_user, outsider):
            socks[u.id] = FakeSocket()
            await realtime.manager.connect(u.id, socks[u.id])

        await service.create_item(
            db_session,
            board,
            project,
            actor=owner,
            type_="note",
            x=0,
            y=0,
            width=None,
            height=None,
            content={"text": "hello"},
            color=None,
        )

        assert len(socks[owner.id].sent) == 1
        assert len(socks[teammate.id].sent) == 1
        assert len(socks[contact_user.id].sent) == 1
        assert socks[outsider.id].sent == []

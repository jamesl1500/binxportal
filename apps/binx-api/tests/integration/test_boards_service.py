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
        # The comment itself broadcasts, and notifying the card author now
        # broadcasts too (notifications/service.py) — order isn't contractual,
        # so check both landed rather than asserting on sock.sent[-1].
        event_types = [event["type"] for event in sock.sent]
        assert realtime.EVENT_BOARD_COMMENT_CREATED in event_types
        assert realtime.EVENT_NOTIFICATION_CREATED in event_types

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


class TestApproval:
    async def test_request_decide_and_notify(self, db_session) -> None:
        owner = await make_user(db_session, full_name="Card Requester")
        contact_user = await make_user(db_session, full_name="Client Casey")
        agency = await make_agency(db_session, owner=owner)
        client = await make_client(db_session, agency=agency)
        await make_client_contact(db_session, agency=agency, client=client, user=contact_user)
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
            content={"text": "mockup v2"},
            color=None,
        )

        sock = FakeSocket()
        await realtime.manager.connect(owner.id, sock)

        requested = await service.request_approval(db_session, item, project, actor=owner)
        assert requested.approval_status == "pending"
        assert requested.approval_requested_by_name == "Card Requester"
        assert sock.sent[-1]["type"] == realtime.EVENT_BOARD_ITEM_UPDATED
        assert sock.sent[-1]["data"]["approval_status"] == "pending"

        decided = await service.decide_approval(
            db_session, item, project, decider=contact_user, decision="approved", note=None
        )
        assert decided.approval_status == "approved"
        assert decided.approval_decided_by_name == "Client Casey"
        assert decided.approval_decided_at is not None

        event_types = [e["type"] for e in sock.sent]
        assert realtime.EVENT_NOTIFICATION_CREATED in event_types
        rows = (await db_session.execute(select(Notification).where(Notification.user_id == owner.id))).scalars().all()
        assert any(n.event_type == "canvas_approval" for n in rows)

    async def test_decide_requires_pending(self, db_session) -> None:
        from fastapi import HTTPException

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
        with pytest.raises(HTTPException) as exc:
            await service.decide_approval(db_session, item, project, decider=owner, decision="approved", note=None)
        assert exc.value.status_code == 409

    async def test_decide_with_changes_requested_keeps_note(self, db_session) -> None:
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
        await service.request_approval(db_session, item, project, actor=owner)
        decided = await service.decide_approval(
            db_session, item, project, decider=owner, decision="changes_requested", note="  make it blue  "
        )
        assert decided.approval_status == "changes_requested"
        assert decided.approval_note == "make it blue"

    async def test_withdraw_clears_state_and_requires_a_request(self, db_session) -> None:
        from fastapi import HTTPException

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
        with pytest.raises(HTTPException) as exc:
            await service.withdraw_approval(db_session, item, project)
        assert exc.value.status_code == 409

        await service.request_approval(db_session, item, project, actor=owner)
        withdrawn = await service.withdraw_approval(db_session, item, project)
        assert withdrawn.approval_status is None
        assert withdrawn.approval_requested_by_name is None

    async def test_re_request_resets_a_prior_decision(self, db_session) -> None:
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
        await service.request_approval(db_session, item, project, actor=owner)
        await service.decide_approval(
            db_session, item, project, decider=owner, decision="changes_requested", note="fix the logo"
        )
        again = await service.request_approval(db_session, item, project, actor=owner)
        assert again.approval_status == "pending"
        assert again.approval_decided_by_name is None
        assert again.approval_note is None

    async def test_request_pins_a_version_snapshot(self, db_session) -> None:
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
            content={"text": "v1 copy"},
            color=None,
        )
        requested = await service.request_approval(db_session, item, project, actor=owner)
        assert requested.version_number == 1

        versions = await service.list_versions(db_session, item.id)
        assert len(versions) == 1
        assert versions[0].version_number == 1
        assert json.loads(versions[0].content) == {"text": "v1 copy"}
        assert versions[0].status == "pending"

    async def test_approving_pins_approved_version_number(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        contact_user = await make_user(db_session, full_name="Client Casey")
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
            content={"text": "v1"},
            color=None,
        )
        await service.request_approval(db_session, item, project, actor=owner)
        decided = await service.decide_approval(
            db_session, item, project, decider=contact_user, decision="approved", note=None
        )
        assert decided.approved_version_number == 1

        versions = await service.list_versions(db_session, item.id)
        assert versions[0].status == "approved"
        assert versions[0].decided_by_name == "Client Casey"

    async def test_editing_after_approval_clears_decision_but_keeps_the_pinned_version(
        self, db_session
    ) -> None:
        """Editing a card's content after it's approved invalidates the live
        decision (it no longer matches what was approved) but must never
        touch the already-decided BoardItemVersion row — that's the whole
        point of pinning: the client's sign-off stays answerable forever."""
        owner, _agency, _client, project = await _project(db_session)
        contact_user = await make_user(db_session, full_name="Client Casey")
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
            content={"text": "v1"},
            color=None,
        )
        await service.request_approval(db_session, item, project, actor=owner)
        await service.decide_approval(db_session, item, project, decider=contact_user, decision="approved", note=None)

        edited = await service.update_item(db_session, item, project, content={"text": "v2 — a tweak"})
        assert edited.approval_status is None
        assert edited.approval_requested_by_name is None
        assert edited.approved_version_number == 1  # the old sign-off is still pinned
        assert edited.version_number == 1  # no new snapshot is taken until re-requested

        versions = await service.list_versions(db_session, item.id)
        assert len(versions) == 1
        assert json.loads(versions[0].content) == {"text": "v1"}  # untouched by the edit
        assert versions[0].status == "approved"

        # Re-requesting pins the new content as version 2 and leaves version 1 alone.
        requested_again = await service.request_approval(db_session, item, project, actor=owner)
        assert requested_again.version_number == 2
        assert requested_again.approved_version_number == 1

        versions = await service.list_versions(db_session, item.id)
        assert len(versions) == 2
        by_number = {v.version_number: v for v in versions}
        assert json.loads(by_number[1].content) == {"text": "v1"}
        assert json.loads(by_number[2].content) == {"text": "v2 — a tweak"}
        assert by_number[2].status == "pending"

    async def test_moving_or_resizing_after_approval_does_not_clear_the_decision(self, db_session) -> None:
        """Geometry isn't substance — dragging/resizing an approved card
        shouldn't silently reopen its approval."""
        owner, _agency, _client, project = await _project(db_session)
        contact_user = await make_user(db_session, full_name="Client Casey")
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
            content={"text": "v1"},
            color=None,
        )
        await service.request_approval(db_session, item, project, actor=owner)
        await service.decide_approval(db_session, item, project, decider=contact_user, decision="approved", note=None)

        moved = await service.update_item(db_session, item, project, x=100, y=50, width=300)
        assert moved.approval_status == "approved"
        assert moved.approved_version_number == 1


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

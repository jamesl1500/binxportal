"""Integration tests for the Milanote-style canvas structure in
``binx_api.modules.boards.service``: nested boards, columns, lines, link
cards, to-do cards backed by real ProjectTasks, column-wide approvals, and
moving cards between boards.
"""

from __future__ import annotations

import json
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from binx_api.modules.boards import link_preview, service
from binx_api.modules.boards.models import BoardItem, ProjectBoard
from binx_api.modules.messaging import realtime
from binx_api.modules.notifications.models import Notification
from binx_api.modules.projects.models import ProjectTask
from binx_api.modules.projects.service import get_project_board, move_task
from tests.factories import (
    make_agency,
    make_client,
    make_client_contact,
    make_project,
    make_task,
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


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    async def fake_preview(url: str) -> dict:
        return {"url": url, "title": "Fetched title", "description": "Blurb", "image": None, "site_name": "site"}

    monkeypatch.setattr(link_preview, "fetch_preview", fake_preview)


async def _project(db):
    owner = await make_user(db, full_name="Olivia Owner")
    agency = await make_agency(db, owner=owner)
    client = await make_client(db, agency=agency)
    project = await make_project(db, agency=agency, created_by=owner, client=client, name="Rebrand")
    return owner, agency, client, project


async def _card(db, board, project, owner, type_="note", **kw):
    return await service.create_item(
        db,
        board,
        project,
        actor=owner,
        type_=type_,
        x=kw.pop("x", 0),
        y=kw.pop("y", 0),
        width=kw.pop("width", None),
        height=kw.pop("height", None),
        content=kw.pop("content", {"text": "hi"} if type_ == "note" else {}),
        color=kw.pop("color", None),
        **kw,
    )


class TestNestedBoards:
    async def test_board_card_creates_a_child_board_with_breadcrumbs(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        root = await service.get_or_create_board(db_session, project)
        card = await _card(db_session, root, project, owner, "board", content={"title": "Moodboard"})

        child_id = uuid.UUID(json.loads(card.content)["board_id"])
        child = await service.resolve_board(db_session, project, child_id)
        assert child.parent_id == root.id
        assert child.title == "Moodboard"
        assert await service.board_path(db_session, child) == [
            {"id": str(root.id), "title": None},
            {"id": str(child.id), "title": "Moodboard"},
        ]
        # The root is still unique per project.
        assert (await service.get_or_create_board(db_session, project)).id == root.id

    async def test_renaming_the_card_renames_the_board(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        root = await service.get_or_create_board(db_session, project)
        card = await _card(db_session, root, project, owner, "board", content={"title": "Old"})
        await service.update_item(db_session, card, project, content={"title": "New name"})
        child = await db_session.get(ProjectBoard, uuid.UUID(json.loads(card.content)["board_id"]))
        await db_session.refresh(child)
        assert child.title == "New name"

    async def test_deleting_the_card_deletes_the_sub_board_tree(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        root = await service.get_or_create_board(db_session, project)
        card = await _card(db_session, root, project, owner, "board", content={"title": "A"})
        child = await service.resolve_board(db_session, project, uuid.UUID(json.loads(card.content)["board_id"]))
        inner = await _card(db_session, child, project, owner, "board", content={"title": "B"})
        grandchild_id = uuid.UUID(json.loads(inner.content)["board_id"])
        await _card(db_session, child, project, owner)

        root_id = root.id
        project_id = project.id
        await service.delete_item(db_session, card, project)
        db_session.expire_all()
        remaining = (
            (await db_session.execute(select(ProjectBoard.id).where(ProjectBoard.project_id == project_id)))
            .scalars()
            .all()
        )
        assert remaining == [root_id]
        assert await db_session.get(ProjectBoard, grandchild_id) is None

    async def test_another_projects_board_is_404(self, db_session) -> None:
        owner, agency, _client, project = await _project(db_session)
        other = await make_project(db_session, agency=agency, created_by=owner, name="Other")
        other_root = await service.get_or_create_board(db_session, other)
        with pytest.raises(HTTPException) as exc:
            await service.resolve_board(db_session, project, other_root.id)
        assert exc.value.status_code == 404

    async def test_board_read_counts_sub_board_cards_and_pending_reviews(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        root = await service.get_or_create_board(db_session, project)
        card = await _card(db_session, root, project, owner, "board", content={"title": "Review"})
        child = await service.resolve_board(db_session, project, uuid.UUID(json.loads(card.content)["board_id"]))
        note = await _card(db_session, child, project, owner)
        await _card(db_session, child, project, owner)
        await service.request_approval(db_session, note, project, actor=owner)

        payload = await service.board_read(db_session, project, root, owner.id, include_assignee=True)
        board_card = next(i for i in payload["items"] if i["type"] == "board")
        assert board_card["child_count"] == 2
        assert board_card["pending_count"] == 1

    async def test_move_card_into_sub_board_and_no_cycles(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        root = await service.get_or_create_board(db_session, project)
        card = await _card(db_session, root, project, owner, "board", content={"title": "A"})
        child_id = uuid.UUID(json.loads(card.content)["board_id"])
        note = await _card(db_session, root, project, owner)
        line = await _card(db_session, root, project, owner, "line", content={"from": str(note.id), "to": str(card.id)})

        moved = await service.update_item(db_session, note, project, board_id=child_id)
        assert moved.board_id == child_id
        # The line that tied it to the old board is gone.
        assert await db_session.get(BoardItem, line.id) is None

        with pytest.raises(HTTPException) as exc:
            await service.update_item(db_session, card, project, board_id=child_id)
        assert exc.value.status_code == 400


class TestColumns:
    async def test_cards_stack_in_order_and_reindex(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        column = await _card(db_session, board, project, owner, "column", content={"title": "Ideas"})
        a = await _card(db_session, board, project, owner, parent_id=column.id)
        b = await _card(db_session, board, project, owner, parent_id=column.id)
        c = await _card(db_session, board, project, owner, parent_id=column.id, position=0)
        for x in (a, b, c):
            await db_session.refresh(x)
        assert (c.position, a.position, b.position) == (0, 1, 2)

        # Take `a` out — the gap closes.
        await service.update_item(db_session, a, project, clear_parent=True, x=500, y=40)
        await db_session.refresh(b)
        assert a.parent_id is None and a.x == 500
        assert b.position == 1

    async def test_move_between_columns(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        left = await _card(db_session, board, project, owner, "column")
        right = await _card(db_session, board, project, owner, "column")
        a = await _card(db_session, board, project, owner, parent_id=left.id)
        b = await _card(db_session, board, project, owner, parent_id=left.id)
        await service.update_item(db_session, a, project, parent_id=right.id, position=0)
        await db_session.refresh(b)
        assert a.parent_id == right.id and a.position == 0
        assert b.position == 0

    async def test_columns_reject_columns_lines_and_pins(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        column = await _card(db_session, board, project, owner, "column")
        for type_ in ("column", "pin"):
            with pytest.raises(HTTPException) as exc:
                await _card(db_session, board, project, owner, type_, parent_id=column.id)
            assert exc.value.status_code == 400

    async def test_deleting_a_column_releases_its_cards(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        column = await _card(db_session, board, project, owner, "column", x=100, y=100)
        a = await _card(db_session, board, project, owner, parent_id=column.id)
        await service.delete_item(db_session, column, project)
        await db_session.refresh(a)
        assert a.parent_id is None
        assert a.x == 100 and a.y > 100


class TestLines:
    async def test_line_box_follows_its_ends_and_dies_with_its_card(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        a = await _card(db_session, board, project, owner)
        b = await _card(db_session, board, project, owner)
        line = await _card(
            db_session,
            board,
            project,
            owner,
            "line",
            content={"from": str(a.id), "to": str(b.id), "x1": 10, "y1": 20, "x2": 210, "y2": 120, "arrow": "bogus"},
        )
        assert (line.x, line.y, line.width, line.height) == (10, 20, 200, 100)
        assert json.loads(line.content)["arrow"] == "end"

        await service.delete_item(db_session, a, project)
        assert await db_session.get(BoardItem, line.id) is None

    async def test_line_cannot_reach_another_board(self, db_session) -> None:
        owner, agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        other = await make_project(db_session, agency=agency, created_by=owner, name="Other")
        foreign = await _card(db_session, await service.get_or_create_board(db_session, other), other, owner)
        with pytest.raises(HTTPException) as exc:
            await _card(db_session, board, project, owner, "line", content={"from": str(foreign.id)})
        assert exc.value.status_code == 400


class TestLinks:
    async def test_link_card_stores_the_preview(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        card = await _card(db_session, board, project, owner, "link", content={"url": "example.com/page"})
        content = json.loads(card.content)
        assert content["url"] == "https://example.com/page"
        assert content["title"] == "Fetched title"

    async def test_rejects_non_web_links(self) -> None:
        for bad in ("javascript:alert(1)", "ftp://x.example", ""):
            with pytest.raises(HTTPException):
                link_preview.normalize_url(bad)

    def test_parse_preview_prefers_open_graph(self) -> None:
        html = """<html><head><title>Plain</title>
            <meta property="og:title" content="OG Title">
            <meta name="description" content="Desc">
            <meta property="og:image" content="/img.png"></head></html>"""
        preview = link_preview.parse_preview("https://example.com/a", html)
        assert preview["title"] == "OG Title"
        assert preview["description"] == "Desc"
        assert preview["image"] == "https://example.com/img.png"

    async def test_private_hosts_are_never_fetched(self) -> None:
        assert not await link_preview._host_is_public("127.0.0.1")
        assert not await link_preview._host_is_public("10.0.0.5")
        assert not await link_preview._host_is_public("169.254.169.254")


class TestTodoCards:
    async def test_rows_are_real_tasks_and_ticking_moves_them(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        todo = await _card(db_session, board, project, owner, "todo", content={"title": "Launch"})

        row = await service.add_todo_task(db_session, todo, project, actor=owner, title="Write copy")
        columns = await get_project_board(db_session, project.id)
        first_list, last_list = columns[0][0], columns[-1][0]
        task = await db_session.get(ProjectTask, uuid.UUID(row["id"]))
        assert task.list_id == first_list.id and task.board_item_id == todo.id
        assert row["done"] is False

        ticked = await service.update_todo_task(db_session, todo, project, task, actor=owner, done=True)
        await db_session.refresh(task)
        assert ticked["done"] is True and task.list_id == last_list.id

        unticked = await service.update_todo_task(db_session, todo, project, task, actor=owner, done=False)
        await db_session.refresh(task)
        assert unticked["done"] is False and task.list_id == first_list.id

    async def test_kanban_moves_reach_the_canvas_live(self, db_session) -> None:
        owner, _agency, client, project = await _project(db_session)
        contact = await make_user(db_session, full_name="Casey Client", email="casey@c.example")
        await make_client_contact(db_session, agency=_agency, client=client, user=contact)
        board = await service.get_or_create_board(db_session, project)
        todo = await _card(db_session, board, project, owner, "todo")
        row = await service.add_todo_task(db_session, todo, project, actor=owner, title="Ship")
        task = await db_session.get(ProjectTask, uuid.UUID(row["id"]))
        await service.update_todo_task(db_session, todo, project, task, actor=owner, assignee_id=owner.id)

        staff_ws, client_ws = FakeSocket(), FakeSocket()
        await realtime.manager.connect(owner.id, staff_ws)
        await realtime.manager.connect(contact.id, client_ws)

        columns = await get_project_board(db_session, project.id)
        await move_task(db_session, task, list_id=columns[-1][0].id, position=0)
        await service.sync_task_change(db_session, project, task.id)

        staff_event = staff_ws.sent[-1]
        assert staff_event["type"] == "board.task.upserted"
        assert staff_event["data"]["done"] is True
        assert staff_event["data"]["assignee_name"] == "Olivia Owner"
        # Clients never see who internally owns the task.
        assert client_ws.sent[-1]["data"]["assignee_name"] is None

    async def test_remove_detaches_or_deletes(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        todo = await _card(db_session, board, project, owner, "todo")
        keep = await db_session.get(
            ProjectTask,
            uuid.UUID((await service.add_todo_task(db_session, todo, project, actor=owner, title="a"))["id"]),
        )
        drop = await db_session.get(
            ProjectTask,
            uuid.UUID((await service.add_todo_task(db_session, todo, project, actor=owner, title="b"))["id"]),
        )
        await service.remove_todo_task(db_session, todo, project, keep, delete_task=False)
        keep_id, drop_id = keep.id, drop.id
        await service.remove_todo_task(db_session, todo, project, drop, delete_task=True)
        db_session.expire_all()
        assert (await db_session.get(ProjectTask, keep_id)).board_item_id is None
        assert await db_session.get(ProjectTask, drop_id) is None

    async def test_attach_existing_task_and_card_delete_keeps_tasks(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        todo = await _card(db_session, board, project, owner, "todo")
        task = await make_task(db_session, project=project, title="Existing")
        row = await service.attach_task(db_session, todo, project, task)
        assert row["item_id"] == str(todo.id)
        tasks = await service.list_board_tasks(db_session, project, board.id, include_assignee=False)
        assert [t["title"] for t in tasks] == ["Existing"]

        task_id = task.id
        await service.delete_item(db_session, todo, project)
        db_session.expire_all()
        survivor = await db_session.get(ProjectTask, task_id)
        assert survivor is not None and survivor.board_item_id is None

    async def test_clients_cannot_create_todo_cards(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        with pytest.raises(HTTPException) as exc:
            await _card(db_session, board, project, owner, "todo", author_kind="client")
        assert exc.value.status_code == 403


class TestColumnApproval:
    async def test_request_and_decide_a_whole_column(self, db_session) -> None:
        owner, agency, client, project = await _project(db_session)
        contact = await make_user(db_session, full_name="Casey Client", email="casey2@c.example")
        await make_client_contact(db_session, agency=agency, client=client, user=contact)
        board = await service.get_or_create_board(db_session, project)
        column = await _card(db_session, board, project, owner, "column", content={"title": "Logos"})
        a = await _card(db_session, board, project, owner, parent_id=column.id)
        b = await _card(db_session, board, project, owner, parent_id=column.id)
        todo = await _card(db_session, board, project, owner, "todo", parent_id=column.id)

        await service.request_approval(db_session, column, project, actor=owner)
        for x in (a, b, todo):
            await db_session.refresh(x)
        assert a.approval_status == "pending" and b.approval_status == "pending"
        assert todo.approval_status is None  # to-do lists aren't approvable

        await service.decide_approval(db_session, column, project, decider=contact, decision="approved", note=None)
        for x in (a, b):
            await db_session.refresh(x)
        assert a.approval_status == b.approval_status == "approved"
        assert a.approved_version_number == 1

        notes = (await db_session.execute(select(Notification).where(Notification.user_id == owner.id))).scalars().all()
        approval_notes = [n for n in notes if n.event_type == "canvas_approval"]
        assert len(approval_notes) == 1
        assert "2 cards in “Logos”" in approval_notes[0].title

    async def test_empty_column_request_is_409(self, db_session) -> None:
        owner, _agency, _client, project = await _project(db_session)
        board = await service.get_or_create_board(db_session, project)
        column = await _card(db_session, board, project, owner, "column")
        with pytest.raises(HTTPException) as exc:
            await service.request_approval(db_session, column, project, actor=owner)
        assert exc.value.status_code == 409

    async def test_withdraw_column_clears_pending_only(self, db_session) -> None:
        owner, agency, client, project = await _project(db_session)
        contact = await make_user(db_session, full_name="Casey", email="casey3@c.example")
        await make_client_contact(db_session, agency=agency, client=client, user=contact)
        board = await service.get_or_create_board(db_session, project)
        column = await _card(db_session, board, project, owner, "column")
        a = await _card(db_session, board, project, owner, parent_id=column.id)
        b = await _card(db_session, board, project, owner, parent_id=column.id)
        await service.request_approval(db_session, a, project, actor=owner)
        await service.decide_approval(db_session, a, project, decider=contact, decision="approved", note=None)
        await service.request_approval(db_session, b, project, actor=owner)

        await service.withdraw_approval(db_session, column, project)
        await db_session.refresh(a)
        await db_session.refresh(b)
        assert a.approval_status == "approved"
        assert b.approval_status is None

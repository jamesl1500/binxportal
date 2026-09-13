"""
Integration tests for ``binx_api.modules.notifications.service`` — storing a
notification (honouring the recipient's per-category mute toggle and never
notifying the actor), and the read-state helpers behind the dropdown.
"""

from __future__ import annotations

import pytest

from binx_api.modules.messaging import realtime
from binx_api.modules.notifications import service
from binx_api.modules.notifications.models import CATEGORY_PROJECTS, CATEGORY_TEAM
from binx_api.modules.users.models import UserNotificationSettings
from tests.factories import make_user

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


class TestNotify:
    async def test_stores_a_row_for_the_recipient(self, db_session) -> None:
        recipient = await make_user(db_session)
        actor = await make_user(db_session, full_name="Ada Actor")

        created = await service.notify(
            db_session,
            user_id=recipient.id,
            category=CATEGORY_TEAM,
            event_type="invite_accepted",
            title="Someone joined",
            body="Body text",
            link="/team",
            actor=actor,
        )

        assert created is not None
        assert created.user_id == recipient.id
        assert created.actor_name == "Ada Actor"
        assert await service.unread_count(db_session, recipient) == 1

    async def test_never_notifies_the_actor_about_their_own_action(self, db_session) -> None:
        actor = await make_user(db_session)

        created = await service.notify(
            db_session,
            user_id=actor.id,
            category=CATEGORY_TEAM,
            event_type="invite_accepted",
            title="You did a thing",
            actor=actor,
        )

        assert created is None
        assert await service.unread_count(db_session, actor) == 0

    async def test_a_muted_category_is_dropped_silently(self, db_session) -> None:
        recipient = await make_user(db_session)
        db_session.add(UserNotificationSettings(user_id=recipient.id, inapp_projects=False))
        await db_session.commit()

        dropped = await service.notify(
            db_session,
            user_id=recipient.id,
            category=CATEGORY_PROJECTS,
            event_type="task_assigned",
            title="You were assigned a task",
        )
        kept = await service.notify(
            db_session,
            user_id=recipient.id,
            category=CATEGORY_TEAM,
            event_type="invite_accepted",
            title="Someone joined",
        )

        assert dropped is None
        assert kept is not None
        assert await service.unread_count(db_session, recipient) == 1

    async def test_notify_many_fans_out_and_skips_the_actor(self, db_session) -> None:
        actor = await make_user(db_session)
        a = await make_user(db_session)
        b = await make_user(db_session)

        rows = await service.notify_many(
            db_session,
            user_ids=[a.id, b.id, actor.id, a.id],
            category=CATEGORY_TEAM,
            event_type="mention",
            title="Mentioned",
            actor=actor,
        )

        assert {row.user_id for row in rows} == {a.id, b.id}


class TestRealtimeBroadcast:
    async def test_notify_pushes_over_the_recipients_socket(self, db_session) -> None:
        recipient = await make_user(db_session)
        sock = FakeSocket()
        await realtime.manager.connect(recipient.id, sock)

        created = await service.notify(
            db_session,
            user_id=recipient.id,
            category=CATEGORY_TEAM,
            event_type="invite_accepted",
            title="Someone joined",
        )

        assert created is not None
        assert len(sock.sent) == 1
        assert sock.sent[0]["type"] == realtime.EVENT_NOTIFICATION_CREATED
        assert sock.sent[0]["data"]["id"] == str(created.id)
        assert sock.sent[0]["data"]["title"] == "Someone joined"

    async def test_a_muted_category_does_not_broadcast(self, db_session) -> None:
        recipient = await make_user(db_session)
        db_session.add(UserNotificationSettings(user_id=recipient.id, inapp_projects=False))
        await db_session.commit()
        sock = FakeSocket()
        await realtime.manager.connect(recipient.id, sock)

        dropped = await service.notify(
            db_session,
            user_id=recipient.id,
            category=CATEGORY_PROJECTS,
            event_type="task_assigned",
            title="Assigned",
        )

        assert dropped is None
        assert sock.sent == []

    async def test_notify_many_broadcasts_to_each_recipient_only(self, db_session) -> None:
        actor = await make_user(db_session)
        a = await make_user(db_session)
        b = await make_user(db_session)
        sock_a, sock_b, sock_actor = FakeSocket(), FakeSocket(), FakeSocket()
        await realtime.manager.connect(a.id, sock_a)
        await realtime.manager.connect(b.id, sock_b)
        await realtime.manager.connect(actor.id, sock_actor)

        await service.notify_many(
            db_session,
            user_ids=[a.id, b.id, actor.id],
            category=CATEGORY_TEAM,
            event_type="mention",
            title="Mentioned",
            actor=actor,
        )

        assert len(sock_a.sent) == 1
        assert len(sock_b.sent) == 1
        assert sock_actor.sent == []  # never notifies the actor about their own action


class TestReadState:
    async def test_mark_read_and_mark_all_read(self, db_session) -> None:
        recipient = await make_user(db_session)
        for i in range(3):
            await service.notify(
                db_session,
                user_id=recipient.id,
                category=CATEGORY_TEAM,
                event_type="invite_accepted",
                title=f"Event {i}",
            )

        newest = (await service.list_notifications(db_session, recipient, limit=1))[0]
        await service.mark_read(db_session, newest)
        assert await service.unread_count(db_session, recipient) == 2

        marked = await service.mark_all_read(db_session, recipient)
        assert marked == 2
        assert await service.unread_count(db_session, recipient) == 0

    async def test_list_can_filter_to_unread_and_paginate(self, db_session) -> None:
        recipient = await make_user(db_session)
        for i in range(5):
            await service.notify(
                db_session,
                user_id=recipient.id,
                category=CATEGORY_TEAM,
                event_type="invite_accepted",
                title=f"Event {i}",
            )
        first_page = await service.list_notifications(db_session, recipient, limit=2, offset=0)
        second_page = await service.list_notifications(db_session, recipient, limit=2, offset=2)
        assert [n.id for n in first_page] != [n.id for n in second_page]

        await service.mark_all_read(db_session, recipient)
        assert await service.list_notifications(db_session, recipient, unread_only=True) == []

    async def test_delete_removes_the_row(self, db_session) -> None:
        recipient = await make_user(db_session)
        created = await service.notify(
            db_session,
            user_id=recipient.id,
            category=CATEGORY_TEAM,
            event_type="invite_accepted",
            title="Event",
        )
        assert created is not None
        await service.delete_notification(db_session, created)
        assert await service.list_notifications(db_session, recipient) == []

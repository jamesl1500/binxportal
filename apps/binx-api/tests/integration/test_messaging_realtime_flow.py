"""
Integration coverage for the realtime path: a service mutation should push an
event to a participant's registered socket. Uses a fake socket registered
straight on ``realtime.manager`` rather than a real websocket handshake — the
handshake/ticket plumbing is covered by ``tests/e2e/test_messaging_ws.py``.
"""

from __future__ import annotations

import pytest

from binx_api.modules.messaging import realtime, service
from tests.factories import add_agency_member, make_agency, make_conversation, make_user

pytestmark = pytest.mark.integration


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def accept(self) -> None:  # pragma: no cover - not called here
        pass

    async def send_json(self, data: dict) -> None:
        self.sent.append(data)


@pytest.fixture(autouse=True)
def _fresh_manager(monkeypatch):
    monkeypatch.setattr(realtime, "manager", realtime.ConnectionManager())
    monkeypatch.setattr(service.realtime, "manager", realtime.manager)


async def test_post_message_pushes_message_created_to_other_participants(db_session) -> None:
    alice = await make_user(db_session, full_name="Alice")
    bob = await make_user(db_session, full_name="Bob")
    agency = await make_agency(db_session, owner=alice)
    await add_agency_member(db_session, agency=agency, user=bob)
    conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])

    bob_socket = FakeSocket()
    await realtime.manager.connect(bob.id, bob_socket)

    await service.post_message(db_session, conversation, sender=alice, body="live update", uploads=[])

    assert len(bob_socket.sent) == 1
    event = bob_socket.sent[0]
    assert event["type"] == realtime.EVENT_MESSAGE_CREATED
    assert event["conversation_id"] == str(conversation.id)
    assert event["data"]["body"] == "live update"


async def test_typing_target_is_every_other_active_participant(db_session) -> None:
    alice = await make_user(db_session)
    bob = await make_user(db_session)
    agency = await make_agency(db_session, owner=alice)
    await add_agency_member(db_session, agency=agency, user=bob)
    conversation = await make_conversation(db_session, agency=agency, creator=alice, others=[bob])

    targets = await service.typing_participants(db_session, conversation.id, alice)
    assert targets == [bob.id]

    outsider = await make_user(db_session)
    assert await service.typing_participants(db_session, conversation.id, outsider) is None

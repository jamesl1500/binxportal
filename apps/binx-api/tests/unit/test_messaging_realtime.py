"""Unit tests for the in-process websocket connection manager."""

from __future__ import annotations

import uuid

import pytest

from binx_api.modules.messaging.realtime import ConnectionManager

pytestmark = pytest.mark.unit


class FakeSocket:
    def __init__(self, *, fail: bool = False) -> None:
        self.sent: list[dict] = []
        self.accepted = False
        self._fail = fail

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, data: dict) -> None:
        if self._fail:
            raise RuntimeError("socket closed")
        self.sent.append(data)


async def test_fan_out_reaches_every_socket_of_every_listed_user() -> None:
    manager = ConnectionManager()
    alice, bob = uuid.uuid4(), uuid.uuid4()
    alice_tab_1, alice_tab_2, bob_tab = FakeSocket(), FakeSocket(), FakeSocket()

    await manager.connect(alice, alice_tab_1)
    await manager.connect(alice, alice_tab_2)
    await manager.connect(bob, bob_tab)

    await manager.send_to_users([alice, bob], {"type": "message.created"})

    assert alice_tab_1.sent == [{"type": "message.created"}]
    assert alice_tab_2.sent == [{"type": "message.created"}]
    assert bob_tab.sent == [{"type": "message.created"}]


async def test_disconnect_stops_delivery() -> None:
    manager = ConnectionManager()
    alice = uuid.uuid4()
    socket = FakeSocket()

    await manager.connect(alice, socket)
    await manager.disconnect(alice, socket)
    await manager.send_to_users([alice], {"type": "x"})

    assert socket.sent == []


async def test_a_failing_socket_is_dropped_and_does_not_block_others() -> None:
    manager = ConnectionManager()
    alice = uuid.uuid4()
    dead, alive = FakeSocket(fail=True), FakeSocket()

    await manager.connect(alice, dead)
    await manager.connect(alice, alive)
    await manager.send_to_users([alice], {"type": "x"})

    assert alive.sent == [{"type": "x"}]
    # The dead socket was pruned.
    await manager.send_to_users([alice], {"type": "y"})
    assert alive.sent[-1] == {"type": "y"}

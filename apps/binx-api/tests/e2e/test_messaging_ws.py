"""
The websocket connection ticket. The browser can't attach the bearer header
to a cross-origin WS handshake, so it trades its session for a short-lived
ticket first (``POST /auth/ws-ticket``) and passes that on the ``?ticket=``
query string.

The socket handler itself and its fan-out are covered by
``tests/unit/test_messaging_realtime.py`` and
``tests/integration/test_messaging_realtime_flow.py`` — a real handshake here
would need a second event loop, which this suite's shared-session fixtures
don't support.
"""

from __future__ import annotations

import pytest

from binx_api.core.security import decode_ws_ticket
from tests.conftest import auth_headers
from tests.factories import make_user

pytestmark = pytest.mark.e2e


async def test_ws_ticket_is_issued_for_a_session_and_round_trips(client, db_session) -> None:
    user = await make_user(db_session)
    response = await client.post("/auth/ws-ticket", headers=auth_headers(user))
    assert response.status_code == 200
    ticket = response.json()["ticket"]
    assert decode_ws_ticket(ticket) == str(user.id)


async def test_ws_ticket_needs_a_session(client) -> None:
    assert (await client.post("/auth/ws-ticket")).status_code == 401


async def test_an_access_token_is_not_a_ws_ticket(client, db_session) -> None:
    """The access token and the ws ticket are different token types — one
    can't stand in for the other."""
    user = await make_user(db_session)
    access_token = auth_headers(user)["Authorization"].removeprefix("Bearer ")
    assert decode_ws_ticket(access_token) is None

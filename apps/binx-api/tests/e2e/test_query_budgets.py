"""Query budgets: the staff app's hot read endpoints must make a fixed number
of SQL statements however much data an agency has (no N+1 queries).

Each endpoint is called against a small agency and a 3x bigger one, and the
statement counts must match. Against the dev database (RDS, one internet
round trip per query) the messaging N+1 this guards against made the inbox,
the dashboard and the unread badge on every page cost three queries per
conversation.

Also checks the batched inbox reads (unread counts, last-message previews,
the unread total) still apply the same rules the per-conversation reads do.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event

from tests.conftest import auth_headers
from tests.factories import (
    add_agency_member,
    make_agency,
    make_client,
    make_conversation,
    make_invoice,
    make_meeting,
    make_meeting_settings,
    make_project,
    make_task,
    make_user,
    send_message,
)

pytestmark = pytest.mark.e2e

HOT_ENDPOINTS = [
    "/agencies/mine",
    "/notifications?limit=8",
    "{base}/conversations/unread-summary",
    "{base}/conversations",
    "{base}/dashboard",
    "{base}/my-work",
    "{base}/projects",
    "{base}/clients",
    "{base}/invoices",
    "{base}/members",
    "{base}/meetings?status=scheduled",
    "{base}/leads",
]


async def _seed(db, owner, n: int):
    """An agency with n of everything the hot endpoints list."""
    agency = await make_agency(db, owner=owner, name=f"Budget {n}")
    await make_meeting_settings(db, agency=agency)
    hour = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    for i in range(n):
        member = await make_user(db, user_name=f"m{n}_{i}", email=f"m{n}_{i}@example.com", full_name=f"Member {i}")
        await add_agency_member(db, agency=agency, user=member)
        client = await make_client(db, agency=agency, name=f"Client {n}-{i}")
        project = await make_project(db, agency=agency, created_by=owner, client=client, name=f"Project {n}-{i}")
        for j in range(2):
            task = await make_task(db, project=project, title=f"Task {i}-{j}")
            task.assignee_id = owner.id
            await db.commit()
        await make_invoice(db, agency=agency, created_by=owner, client=client)
        await make_meeting(
            db, agency=agency, client=client, booked_by=owner, starts_at=hour + timedelta(days=1, hours=i)
        )
        conversation = await make_conversation(db, agency=agency, creator=owner, others=[member])
        await send_message(db, conversation=conversation, sender=member)
    return agency


class _StatementCounter:
    def __init__(self, engine) -> None:
        self.engine = engine.sync_engine
        self.count = 0

    def _before(self, *_args, **_kwargs) -> None:
        self.count += 1

    def __enter__(self) -> _StatementCounter:
        event.listen(self.engine, "before_cursor_execute", self._before)
        return self

    def __exit__(self, *_exc) -> None:
        event.remove(self.engine, "before_cursor_execute", self._before)


async def _counts(client, engine, user, agency) -> dict[str, int]:
    counts: dict[str, int] = {}
    with _StatementCounter(engine) as counter:
        for template in HOT_ENDPOINTS:
            path = template.format(base=f"/agencies/{agency.id}")
            counter.count = 0
            response = await client.get(path, headers=auth_headers(user))
            assert response.status_code == 200, (path, response.text)
            counts[template] = counter.count
    return counts


async def test_hot_endpoints_dont_grow_with_data(client, db_session, engine, user) -> None:
    small = await _counts(client, engine, user, await _seed(db_session, user, 2))
    large = await _counts(client, engine, user, await _seed(db_session, user, 6))
    grew = {path: f"{small[path]} -> {large[path]}" for path in HOT_ENDPOINTS if large[path] > small[path]}
    assert grew == {}, f"statement count grows with data (N+1?): {grew}"


async def test_batched_inbox_keeps_the_unread_rules(client, db_session, user) -> None:
    agency = await make_agency(db_session, owner=user, name="Unread Rules")
    bob = await make_user(db_session, user_name="bob_u", email="bob_u@example.com", full_name="Bob")
    cara = await make_user(db_session, user_name="cara_u", email="cara_u@example.com", full_name="Cara")
    for member in (bob, cara):
        await add_agency_member(db_session, agency=agency, user=member)

    with_bob = await make_conversation(db_session, agency=agency, creator=user, others=[bob], title="Bob")
    with_cara = await make_conversation(db_session, agency=agency, creator=user, others=[cara], title="Cara")
    await make_conversation(db_session, agency=agency, creator=user, others=[bob, cara], title="Quiet")
    await send_message(db_session, conversation=with_bob, sender=bob, body="one")
    await send_message(db_session, conversation=with_bob, sender=bob, body="two")
    await send_message(db_session, conversation=with_bob, sender=user, body="my own reply doesn't count")
    await send_message(db_session, conversation=with_cara, sender=cara, body="hello")

    base = f"/agencies/{agency.id}/conversations"
    inbox = {c["title"]: c for c in (await client.get(base, headers=auth_headers(user))).json()}
    assert inbox["Bob"]["unread_count"] == 2
    assert inbox["Bob"]["last_message_preview"] == "my own reply doesn't count"
    assert inbox["Cara"]["unread_count"] == 1
    assert inbox["Cara"]["last_message_preview"] == "hello"
    assert inbox["Quiet"]["unread_count"] == 0
    assert inbox["Quiet"]["participant_count"] == 3
    total = (await client.get(f"{base}/unread-summary", headers=auth_headers(user))).json()["unread_total"]
    assert total == 3 == sum(c["unread_count"] for c in inbox.values())

    # Reading one conversation clears just that one, in both places.
    await client.post(f"{base}/{with_bob.id}/read", headers=auth_headers(user))
    inbox = {c["title"]: c for c in (await client.get(base, headers=auth_headers(user))).json()}
    assert (inbox["Bob"]["unread_count"], inbox["Cara"]["unread_count"]) == (0, 1)
    assert (await client.get(f"{base}/unread-summary", headers=auth_headers(user))).json()["unread_total"] == 1

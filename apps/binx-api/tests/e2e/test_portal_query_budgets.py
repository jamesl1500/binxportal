"""Query budgets for the client portal: every read a client's page makes
must cost a fixed number of SQL statements however much their agency has
shared with them (no N+1 queries).

The (portal) layout alone calls six of these on every full page load (the
sidebar badges, the kickoff invite), so a per-row query here is paid on
every page a client opens. Same method as test_query_budgets.py: a client
with 2 of everything, then another with 6, and the counts must match.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event, select

from binx_api.modules.invoicing.models import Invoice
from binx_api.modules.messaging.service import create_conversation
from binx_api.modules.proposals.models import Proposal
from tests.conftest import auth_headers
from tests.factories import (
    add_agency_member,
    make_agency,
    make_client,
    make_client_contact,
    make_invoice,
    make_meeting,
    make_meeting_settings,
    make_project,
    make_task,
    make_user,
    send_message,
)

pytestmark = pytest.mark.e2e

# What the (portal) layout and its pages read. {project}, {invoice},
# {proposal} and {conversation} are the client's first of each.
PORTAL_READS = [
    "/portal/context",
    "/portal/projects",
    "/portal/projects/{project}",
    "/portal/projects/{project}/board",
    "/portal/projects/{project}/canvas",
    "/portal/team",
    "/portal/kickoffs/pending",
    "/portal/invoices",
    "/portal/invoices/{invoice}",
    "/portal/proposals",
    "/portal/proposals/{proposal}",
    "/portal/meetings",
    "/portal/meeting-settings",
    "/portal/conversations",
    "/portal/conversations/{conversation}",
    "/portal/conversations/{conversation}/messages",
]


async def _seed(client, db, n: int) -> tuple[object, dict[str, str]]:
    """An agency sharing n of everything with one client, and that client's
    portal contact."""
    owner = await make_user(db, user_name=f"owner{n}", email=f"owner{n}@example.com", full_name=f"Owner {n}")
    agency = await make_agency(db, owner=owner, name=f"Portal Budget {n}")
    await make_meeting_settings(db, agency=agency)
    customer = await make_client(db, agency=agency, name=f"Client {n}")
    contact = await make_user(db, user_name=f"contact{n}", email=f"contact{n}@example.com", full_name=f"Contact {n}")
    await make_client_contact(db, agency=agency, client=customer, user=contact, is_primary=True)
    staff = []
    for i in range(n):
        member = await make_user(db, user_name=f"s{n}_{i}", email=f"s{n}_{i}@example.com", full_name=f"Staff {i}")
        await add_agency_member(db, agency=agency, user=member)
        staff.append(member)

    hour = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    ids: dict[str, str] = {}
    base = f"/agencies/{agency.id}"
    for i in range(n):
        project = await make_project(db, agency=agency, created_by=owner, client=customer, name=f"Project {n}-{i}")
        for j in range(2):
            task = await make_task(db, project=project, title=f"Task {i}-{j}")
            task.assignee_id = staff[i].id
        await db.commit()
        kickoff = await client.post(
            f"{base}/projects/{project.id}/kickoff",
            json={"title": "Kickoff", "questions": [{"type": "text", "label": "Goals?"}]},
            headers=auth_headers(owner),
        )
        assert kickoff.status_code == 201, kickoff.text
        sent = await client.post(f"{base}/projects/{project.id}/kickoff/send", headers=auth_headers(owner))
        assert sent.status_code == 200, sent.text

        invoice = await make_invoice(db, agency=agency, created_by=owner, client=customer)
        invoice.status = "sent"
        proposal = await client.post(
            f"{base}/proposals",
            json={
                "title": f"Proposal {i}",
                "client_id": str(customer.id),
                "recipient_name": "Contact",
                "recipient_email": f"contact{n}@example.com",
                "content": "Scope",
                "currency": "USD",
                "tax_rate_percent": "0",
                "line_items": [{"description": "Work", "quantity": "1", "unit_price_cents": 1000}],
            },
            headers=auth_headers(owner),
        )
        assert proposal.status_code == 201, proposal.text
        await make_meeting(
            db, agency=agency, client=customer, booked_by=owner, starts_at=hour + timedelta(days=1, hours=i)
        )
        conversation = await create_conversation(
            db,
            agency,
            creator=owner,
            kind="group",
            title=f"Thread {i}",
            participant_user_ids=[staff[i].id],
            client_id=customer.id,
            project_id=project.id,
            initial_message=None,
        )
        await send_message(db, conversation=conversation, sender=staff[i])
        await send_message(db, conversation=conversation, sender=contact)
        ids.setdefault("project", str(project.id))
        ids.setdefault("invoice", str(invoice.id))
        ids.setdefault("proposal", proposal.json()["id"])
        ids.setdefault("conversation", str(conversation.id))

    for row in (await db.execute(select(Proposal).where(Proposal.agency_id == agency.id))).scalars():
        row.status = "sent"
    await db.commit()
    assert (await db.execute(select(Invoice).where(Invoice.status == "sent"))).scalars().first() is not None
    return contact, ids


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


async def _counts(client, engine, contact, ids: dict[str, str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    with _StatementCounter(engine) as counter:
        for template in PORTAL_READS:
            path = template.format(**ids)
            counter.count = 0
            response = await client.get(path, headers=auth_headers(contact))
            assert response.status_code == 200, (path, response.text)
            counts[template] = counter.count
    return counts


async def test_portal_reads_dont_grow_with_data(client, db_session, engine) -> None:
    small = await _counts(client, engine, *await _seed(client, db_session, 2))
    large = await _counts(client, engine, *await _seed(client, db_session, 6))
    print("\nportal statement counts (n=2 -> n=6):")
    for path in PORTAL_READS:
        print(f"  {small[path]:>3} -> {large[path]:>3}  {path}")
    grew = {path: f"{small[path]} -> {large[path]}" for path in PORTAL_READS if large[path] > small[path]}
    assert grew == {}, f"statement count grows with data (N+1?): {grew}"

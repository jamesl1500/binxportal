"""Query budgets for proposals: every read and write a proposal's pages make
must cost a fixed number of SQL statements however many packages, lines,
add-ons and history events it has (no N+1 queries), and the share link's
hot paths stay within a small absolute budget (each statement is a round
trip to the database).

Same method as test_query_budgets.py: a small proposal and a much bigger
one, and the counts must match.
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import event

from binx_api.modules.billing import service as billing_service
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e

CHROME = {"user-agent": "Mozilla/5.0 (Chrome)"}


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


def _token(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


def _proposal_payload(n: int, *, lead_id: str, client_id: str) -> dict:
    """n packages (2..4), n lines in each, n shared lines and n add-ons."""
    packages = [{"key": f"p{i}", "name": f"Package {i}"} for i in range(n)]
    lines = [{"description": f"Shared {i}", "quantity": "1", "unit_price_cents": 1000} for i in range(n)]
    for i in range(n):
        lines += [
            {"description": f"P{i} line {j}", "quantity": "1", "unit_price_cents": 500, "package_key": f"p{i}"}
            for j in range(n)
        ]
    lines += [
        {"description": f"Add-on {i}", "quantity": "1", "unit_price_cents": 100, "optional": True} for i in range(n)
    ]
    lines.append(
        {"description": "Care", "quantity": "1", "unit_price_cents": 50, "optional": True, "billing": "monthly"}
    )
    return {
        "title": f"Proposal {n}",
        "lead_id": lead_id,
        "client_id": client_id,
        "recipient_email": f"contact{n}@example.com",
        "packages": packages,
        "line_items": lines,
    }


async def _seed(client, db, n: int) -> dict:
    owner = await make_user(db, user_name=f"powner{n}", email=f"powner{n}@example.com", full_name=f"Owner {n}")
    agency = await make_agency(db, owner=owner, name=f"Proposal Budget {n}")
    await billing_service.change_plan(db, agency, new_plan="starter", actor=owner)
    customer = await make_client(db, agency=agency, name=f"Client {n}")
    contact = await make_user(db, user_name=f"pcontact{n}", email=f"contact{n}@example.com", full_name=f"Contact {n}")
    await make_client_contact(db, agency=agency, client=customer, user=contact, is_primary=True)
    staff = auth_headers(owner)
    base = f"/agencies/{agency.id}"
    lead = (await client.post(f"{base}/leads", json={"name": f"Lead {n}"}, headers=staff)).json()
    portal = (
        await client.put(f"{base}/leads/{lead['id']}/portal", json={"welcome_message": None}, headers=staff)
    ).json()
    created = await client.post(
        f"{base}/proposals", json=_proposal_payload(n, lead_id=lead["id"], client_id=str(customer.id)), headers=staff
    )
    assert created.status_code == 201, created.text
    proposal = (await client.post(f"{base}/proposals/{created.json()['id']}/send", json={}, headers=staff)).json()
    # Some history: n views from different browsers.
    for i in range(n):
        await client.get(f"/proposals/public/{_token(proposal['share_url'])}", headers={"user-agent": f"Browser {i}"})
    return {
        "staff": staff,
        "contact": auth_headers(contact),
        "base": base,
        "proposal": proposal,
        "token": _token(proposal["share_url"]),
        "lead_portal": _token(portal["url"]),
    }


async def _measure(client, engine, ctx: dict) -> dict[str, int]:
    """The statement count of each step a proposal goes through, in order."""
    proposal, token, base = ctx["proposal"], ctx["token"], ctx["base"]
    second = proposal["packages"][1]["id"]
    add_ons = [line["id"] for line in proposal["line_items"] if line["optional"]][:2]
    steps: list[tuple[str, str, str, dict | None, dict]] = [
        ("staff list", "GET", f"{base}/proposals", None, ctx["staff"]),
        ("staff detail", "GET", f"{base}/proposals/{proposal['id']}", None, ctx["staff"]),
        ("staff events", "GET", f"{base}/proposals/{proposal['id']}/events", None, ctx["staff"]),
        ("lead portal", "GET", f"/lead-portal/{ctx['lead_portal']}", None, {}),
        ("portal detail", "GET", f"/portal/proposals/{proposal['id']}", None, ctx["contact"]),
        ("public read", "GET", f"/proposals/public/{token}", None, CHROME),
        (
            "choose",
            "PUT",
            f"/proposals/public/{token}/options",
            {"package_id": second, "add_on_ids": add_ons},
            CHROME,
        ),
        (
            "portal choose",
            "PUT",
            f"/portal/proposals/{proposal['id']}/options",
            {"package_id": second, "add_on_ids": add_ons[:1]},
            ctx["contact"],
        ),
    ]
    counts: dict[str, int] = {}
    with _StatementCounter(engine) as counter:
        for name, method, path, body, headers in steps:
            counter.count = 0
            resp = await client.request(method, path, json=body, headers=headers)
            assert resp.status_code == 200, (name, resp.text)
            counts[name] = counter.count
        # Signing (the follow-up runs after the response, and is counted
        # apart), then the signed record.
        detail = (await client.get(f"/proposals/public/{token}", headers=CHROME)).json()
        sign = {
            "signer_name": "Signer",
            "signer_email": "signer@example.com",
            "consent": True,
            "document_hash": detail["document_hash"],
        }
        counter.count = 0
        resp = await client.post(f"/proposals/public/{token}/sign", json=sign, headers=CHROME)
        assert resp.status_code == 200, resp.text
        counts["sign + follow-up"] = counter.count
        for name, path in [
            ("certificate", f"/proposals/public/{token}/certificate"),
            ("certificate pdf", f"/proposals/public/{token}/certificate.pdf"),
        ]:
            counter.count = 0
            resp = await client.get(path)
            assert resp.status_code == 200, (name, resp.text)
            counts[name] = counter.count
    return counts


# Ceilings for what a recipient's browser waits on (each statement is a
# round trip; about 26 ms each against the dev database). Raise one only
# with a reason.
BUDGETS = {
    "public read": 10,
    "choose": 19,
    "portal choose": 19,
    "lead portal": 8,
    "certificate": 4,
    "certificate pdf": 4,
    "staff detail": 11,
}


async def test_proposal_reads_and_writes_dont_grow_with_its_size(client, db_session, engine, email_outbox) -> None:
    small = await _measure(client, engine, await _seed(client, db_session, 2))
    large = await _measure(client, engine, await _seed(client, db_session, 4))
    grew = {name: f"{small[name]} -> {large[name]}" for name in small if large[name] > small[name]}
    assert grew == {}, f"statement count grows with the proposal (N+1?): {grew}"
    over = {name: f"{large[name]} > {limit}" for name, limit in BUDGETS.items() if large[name] > limit}
    assert over == {}, f"over the statement budget: {over}"

"""End-to-end: the email code gate (proposals/access.py). With it on, a
proposal's share link opens only after the visitor enters a code that was
emailed to the recipient; the code is single-use, short-lived and capped."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest

from binx_api.modules.billing import service as billing_service
from binx_api.modules.proposals import access
from binx_api.modules.proposals.models import Proposal
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e

CHROME = {"user-agent": "Mozilla/5.0 (Chrome)"}


def _token(share_url: str) -> str:
    return parse_qs(urlparse(share_url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    return agency, owner


async def _sent(client, agency, owner, **fields) -> dict:
    payload = {
        "title": "Brand refresh",
        "recipient_email": "jane@fjord.example",
        "require_email_code": True,
        "line_items": [{"description": "Brand strategy", "quantity": "1", "unit_price_cents": 1_000_000}],
    } | fields
    created = await client.post(f"/agencies/{agency.id}/proposals", json=payload, headers=auth_headers(owner))
    assert created.status_code == 201, created.text
    sent = await client.post(
        f"/agencies/{agency.id}/proposals/{created.json()['id']}/send", json={}, headers=auth_headers(owner)
    )
    assert sent.status_code == 200, sent.text
    return sent.json()


def _code(outbox) -> str:
    mail = [m for m in outbox if m.subject.startswith("Your code for")][-1]
    return re.search(r"\b(\d{6})\b", mail.body).group(1)


async def _unlock(client, sent: dict, outbox) -> dict[str, str]:
    base = f"/proposals/public/{_token(sent['share_url'])}"
    assert (await client.post(f"{base}/code")).status_code == 200
    resp = await client.post(f"{base}/code/verify", json={"code": _code(outbox)}, headers=CHROME)
    assert resp.status_code == 200, resp.text
    return {access.ACCESS_HEADER: resp.json()["access_token"], **CHROME}


async def _backdate_send(db_session, proposal_id: str, by: timedelta = timedelta(minutes=2)) -> None:
    row = await db_session.get(Proposal, proposal_id, populate_existing=True)
    row.access_code_sent_at = datetime.now(UTC) - by
    await db_session.commit()


class TestGate:
    async def test_it_stays_shut_until_the_emailed_code_is_entered(self, client, ctx, email_outbox) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        assert sent["require_email_code"] is True
        base = f"/proposals/public/{_token(sent['share_url'])}"

        shut = await client.get(base)
        assert shut.status_code == 403
        body = shut.json()
        assert body["code"] == "email_code_required"
        assert body["details"] == {
            "agency_name": "Northlight",
            "title": "Brand refresh",
            "email_hint": "j•••@fjord.example",
        }
        assert "Brand strategy" not in shut.text

        sent_code = await client.post(f"{base}/code")
        assert sent_code.json() == {"email_hint": "j•••@fjord.example"}
        mail = [m for m in email_outbox if m.subject.startswith("Your code for")]
        assert [m.to for m in mail] == ["jane@fjord.example"]
        code = _code(email_outbox)
        assert code in mail[0].subject

        wrong = "000000" if code != "000000" else "111111"
        miss = await client.post(f"{base}/code/verify", json={"code": wrong})
        assert miss.status_code == 422
        assert "4 tries left" in miss.json()["detail"]

        # Spaces and dashes typed into the code are fine.
        hit = await client.post(f"{base}/code/verify", json={"code": f"{code[:3]} {code[3:]}"}, headers=CHROME)
        assert hit.status_code == 200, hit.text
        headers = {access.ACCESS_HEADER: hit.json()["access_token"], **CHROME}
        opened = await client.get(base, headers=headers)
        assert opened.status_code == 200
        assert opened.json()["line_items"][0]["description"] == "Brand strategy"
        assert opened.json()["status"] == "viewed"

        # Each code works once.
        again = await client.post(f"{base}/code/verify", json={"code": code})
        assert again.status_code == 422

        events = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}/events", headers=auth_headers(owner))
        verified = [e for e in events.json() if e["kind"] == "email_verified"]
        assert len(verified) == 1
        assert verified[0]["detail"] == "Opened with the code emailed to j•••@fjord.example"

    async def test_until_then_nothing_else_on_the_link_works(self, client, ctx, email_outbox) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        base = f"/proposals/public/{_token(sent['share_url'])}"
        sign = {"signer_name": "Jane", "signer_email": "jane@fjord.example", "consent": True}

        for method, path, body in [
            ("post", "/sign", sign | {"document_hash": sent["document_hash"]}),
            ("post", "/decline", {"reason": None}),
            ("put", "/options", {"package_id": None, "add_on_ids": []}),
            ("get", "/certificate", None),
            ("get", "/certificate.pdf", None),
            ("get", f"/attachments/{sent['id']}", None),
        ]:
            resp = await client.request(method.upper(), f"{base}{path}", json=body)
            assert resp.status_code == 403, (path, resp.text)
            assert resp.json()["code"] == "email_code_required"

        headers = await _unlock(client, sent, email_outbox)
        signed = await client.post(
            f"{base}/sign", json=sign | {"document_hash": sent["document_hash"]}, headers=headers
        )
        assert signed.status_code == 200, signed.text
        certificate = await client.get(f"{base}/certificate", headers=headers)
        assert certificate.status_code == 200
        assert "email_verified" in [event["kind"] for event in certificate.json()["events"]]

    async def test_an_access_token_only_opens_its_own_proposal(self, client, ctx, email_outbox) -> None:
        agency, owner = ctx
        first = await _sent(client, agency, owner)
        second = await _sent(client, agency, owner, title="Website")
        headers = await _unlock(client, first, email_outbox)

        other = await client.get(f"/proposals/public/{_token(second['share_url'])}", headers=headers)
        assert other.status_code == 403
        forged = await client.get(
            f"/proposals/public/{_token(first['share_url'])}", headers={access.ACCESS_HEADER: "not-a-token"}
        )
        assert forged.status_code == 403

    async def test_a_proposal_without_the_gate_opens_as_before(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner, require_email_code=False)
        base = f"/proposals/public/{_token(sent['share_url'])}"
        assert (await client.get(base)).status_code == 200
        assert (await client.post(f"{base}/code")).status_code == 409

    async def test_a_portal_contact_needs_no_code(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        client_row = await make_client(db_session, agency=agency, name="Acme")
        contact = await make_user(db_session, email="dana@acme.example", full_name="Dana Client")
        await make_client_contact(db_session, agency=agency, client=client_row, user=contact)
        sent = await _sent(client, agency, owner, client_id=str(client_row.id), recipient_email="dana@acme.example")
        resp = await client.get(f"/portal/proposals/{sent['id']}", headers=auth_headers(contact))
        assert resp.status_code == 200

    async def test_a_lead_portal_keeps_the_price_behind_the_code(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        await billing_service.change_plan(db_session, agency, new_plan="starter", actor=owner)
        lead = (
            await client.post(
                f"/agencies/{agency.id}/leads",
                json={"name": "Fjord & Field", "contact_name": "Jane", "contact_email": "jane@fjord.example"},
                headers=auth_headers(owner),
            )
        ).json()
        portal = (
            await client.put(
                f"/agencies/{agency.id}/leads/{lead['id']}/portal",
                json={"welcome_message": None},
                headers=auth_headers(owner),
            )
        ).json()
        await _sent(client, agency, owner, lead_id=lead["id"])
        await _sent(client, agency, owner, lead_id=lead["id"], title="Website", require_email_code=False)

        page = (await client.get(f"/lead-portal/{_token(portal['url'])}")).json()
        prices = {proposal["title"]: proposal["total_cents"] for proposal in page["proposals"]}
        assert prices == {"Brand refresh": None, "Website": 1_000_000}


class TestLimits:
    async def test_a_new_code_waits_a_minute_and_replaces_the_last(self, client, ctx, db_session, email_outbox) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        base = f"/proposals/public/{_token(sent['share_url'])}"
        assert (await client.post(f"{base}/code")).status_code == 200
        first = _code(email_outbox)
        too_soon = await client.post(f"{base}/code")
        assert too_soon.status_code == 429

        await _backdate_send(db_session, sent["id"])
        assert (await client.post(f"{base}/code")).status_code == 200
        second = _code(email_outbox)
        if first != second:
            stale = await client.post(f"{base}/code/verify", json={"code": first})
            assert stale.status_code == 422
        assert (await client.post(f"{base}/code/verify", json={"code": second})).status_code == 200

    async def test_five_codes_a_day(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        base = f"/proposals/public/{_token(sent['share_url'])}"
        for _ in range(access.MAX_SENDS_PER_WINDOW):
            assert (await client.post(f"{base}/code")).status_code == 200
            await _backdate_send(db_session, sent["id"])
        capped = await client.post(f"{base}/code")
        assert capped.status_code == 429
        assert "Try again tomorrow" in capped.json()["detail"]

        # A day on, the count starts again.
        row = await db_session.get(Proposal, sent["id"], populate_existing=True)
        row.access_code_window_started_at = datetime.now(UTC) - timedelta(days=1, minutes=1)
        await db_session.commit()
        assert (await client.post(f"{base}/code")).status_code == 200

    async def test_five_wrong_tries_spend_the_code(self, client, ctx, email_outbox) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        base = f"/proposals/public/{_token(sent['share_url'])}"
        await client.post(f"{base}/code")
        code = _code(email_outbox)
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(access.MAX_ATTEMPTS):
            assert (await client.post(f"{base}/code/verify", json={"code": wrong})).status_code == 422
        spent = await client.post(f"{base}/code/verify", json={"code": code})
        assert spent.status_code == 429

    async def test_a_code_expires(self, client, ctx, db_session, email_outbox) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        base = f"/proposals/public/{_token(sent['share_url'])}"
        await client.post(f"{base}/code")
        row = await db_session.get(Proposal, sent["id"], populate_existing=True)
        row.access_code_expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await db_session.commit()
        expired = await client.post(f"{base}/code/verify", json={"code": _code(email_outbox)})
        assert expired.status_code == 422
        assert expired.json()["code"] == "code_expired"

    async def test_drafts_have_no_code(self, client, ctx) -> None:
        agency, owner = ctx
        created = await client.post(
            f"/agencies/{agency.id}/proposals",
            json={"title": "Draft", "require_email_code": True, "line_items": []},
            headers=auth_headers(owner),
        )
        draft = created.json()
        assert draft["require_email_code"] is True
        resp = await client.post(f"/proposals/public/{_token(draft['share_url'])}/code")
        assert resp.status_code == 404


class TestAccessTokens:
    async def test_an_expired_access_token_no_longer_opens_it(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        row = await db_session.get(Proposal, sent["id"])
        stale = access.issue_access_token(row, now=datetime.now(UTC) - access.ACCESS_TTL - timedelta(minutes=1))
        fresh = access.issue_access_token(row)
        base = f"/proposals/public/{_token(sent['share_url'])}"
        assert (await client.get(base, headers={access.ACCESS_HEADER: stale})).status_code == 403
        assert (await client.get(base, headers={access.ACCESS_HEADER: fresh})).status_code == 200

    async def test_a_staff_login_token_is_not_an_access_token(self, client, ctx) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        staff_jwt = auth_headers(owner)["Authorization"].removeprefix("Bearer ")
        resp = await client.get(
            f"/proposals/public/{_token(sent['share_url'])}", headers={access.ACCESS_HEADER: staff_jwt}
        )
        assert resp.status_code == 403

    async def test_the_recipient_can_decline_once_verified(self, client, ctx, email_outbox) -> None:
        agency, owner = ctx
        sent = await _sent(client, agency, owner)
        headers = await _unlock(client, sent, email_outbox)
        resp = await client.post(
            f"/proposals/public/{_token(sent['share_url'])}/decline", json={"reason": "Too much"}, headers=headers
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "declined"

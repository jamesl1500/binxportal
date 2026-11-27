"""End-to-end: lead portals. A branded page for a lead before they're a
client: their sent proposals, a welcome note and a question thread with the
team. Starter plan and up; once the lead signs and becomes a client, it
points them at their client portal."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from binx_api.modules.billing import service as billing_service
from binx_api.modules.leads.models import LeadEvent
from binx_api.modules.notifications.models import Notification
from tests.conftest import auth_headers
from tests.factories import make_agency, make_user

pytestmark = pytest.mark.e2e


def _token(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    await billing_service.change_plan(db_session, agency, new_plan="starter", actor=owner)
    return agency, owner


async def _lead(client, agency, owner) -> dict:
    resp = await client.post(
        f"/agencies/{agency.id}/leads",
        json={"name": "Fjord & Field", "contact_name": "Jane Prospect", "contact_email": "jane@fjord.example"},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _enable(client, agency, owner, lead, welcome="Everything for your rebrand, in one place."):
    resp = await client.put(
        f"/agencies/{agency.id}/leads/{lead['id']}/portal",
        json={"welcome_message": welcome},
        headers=auth_headers(owner),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _send_proposal(client, agency, owner, lead, title="Brand refresh") -> dict:
    created = await client.post(
        f"/agencies/{agency.id}/proposals",
        json={
            "title": title,
            "lead_id": lead["id"],
            "line_items": [{"description": "Brand strategy", "quantity": "1", "unit_price_cents": 500000}],
        },
        headers=auth_headers(owner),
    )
    sent = await client.post(
        f"/agencies/{agency.id}/proposals/{created.json()['id']}/send", json={}, headers=auth_headers(owner)
    )
    return sent.json()


class TestLeadPortal:
    async def test_the_lead_sees_their_sent_proposals_and_branding(self, client, ctx) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        portal = await _enable(client, agency, owner, lead)
        assert portal["enabled"] is True
        token = _token(portal["url"])

        # Drafts stay private; sent proposals are listed with their own link.
        await client.post(
            f"/agencies/{agency.id}/proposals",
            json={"title": "Draft idea", "lead_id": lead["id"]},
            headers=auth_headers(owner),
        )
        sent = await _send_proposal(client, agency, owner, lead)

        page = await client.get(f"/lead-portal/{token}")
        assert page.status_code == 200, page.text
        body = page.json()
        assert body["agency_name"] == "Northlight"
        assert body["lead_name"] == "Fjord & Field"
        assert body["welcome_message"] == "Everything for your rebrand, in one place."
        assert [p["title"] for p in body["proposals"]] == ["Brand refresh"]
        assert body["proposals"][0]["url"] == sent["share_url"]
        assert body["proposals"][0]["display_status"] == "sent"
        assert body["is_client"] is False

        staff = await client.get(f"/agencies/{agency.id}/leads/{lead['id']}/portal", headers=auth_headers(owner))
        assert staff.json()["last_viewed_at"] is not None

    async def test_questions_and_replies(self, client, ctx, db_session, email_outbox) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        token = _token((await _enable(client, agency, owner, lead))["url"])

        asked = await client.post(f"/lead-portal/{token}/messages", json={"body": "Does this include the logo?"})
        assert asked.status_code == 201, asked.text
        assert asked.json()["author_name"] == "Jane Prospect"
        notice = (
            await db_session.execute(select(Notification).where(Notification.event_type == "lead_portal_message"))
        ).scalar_one()
        assert notice.user_id == owner.id  # the lead's owner (who created it)
        event = (await db_session.execute(select(LeadEvent).where(LeadEvent.kind == "portal_message"))).scalar_one()
        assert "Does this include the logo?" in event.body

        replied = await client.post(
            f"/agencies/{agency.id}/leads/{lead['id']}/portal/messages",
            json={"body": "Yes, the logo is in phase one."},
            headers=auth_headers(owner),
        )
        assert replied.status_code == 201
        [mail] = email_outbox
        assert mail.to == "jane@fjord.example"
        assert f"/lead-portal?token={token}" in mail.body

        thread = (await client.get(f"/lead-portal/{token}")).json()["messages"]
        assert [(m["author_kind"], m["author_name"]) for m in thread] == [
            ("lead", "Jane Prospect"),
            ("agency", "Olivia Owner"),
        ]

    async def test_free_plans_cannot_turn_it_on(self, client, db_session) -> None:
        owner = await make_user(db_session, full_name="Free Owner")
        agency = await make_agency(db_session, owner=owner, name="Freebie")
        lead = await _lead(client, agency, owner)
        resp = await client.put(
            f"/agencies/{agency.id}/leads/{lead['id']}/portal", json={}, headers=auth_headers(owner)
        )
        assert resp.status_code == 402
        assert "Starter" in resp.json()["detail"]

    async def test_turning_it_off_or_resetting_the_link_cuts_off_the_old_link(self, client, ctx) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        token = _token((await _enable(client, agency, owner, lead))["url"])

        reset = await client.post(
            f"/agencies/{agency.id}/leads/{lead['id']}/portal/reset-link", headers=auth_headers(owner)
        )
        new_token = _token(reset.json()["url"])
        assert new_token != token
        assert (await client.get(f"/lead-portal/{token}")).status_code == 404
        assert (await client.get(f"/lead-portal/{new_token}")).status_code == 200

        await client.delete(f"/agencies/{agency.id}/leads/{lead['id']}/portal", headers=auth_headers(owner))
        assert (await client.get(f"/lead-portal/{new_token}")).status_code == 404
        assert (await client.post(f"/lead-portal/{new_token}/messages", json={"body": "hi"})).status_code == 404

    async def test_a_downgrade_takes_the_page_down(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        token = _token((await _enable(client, agency, owner, lead))["url"])
        await billing_service.change_plan(db_session, agency, new_plan="free", actor=owner)
        assert (await client.get(f"/lead-portal/{token}")).status_code == 404

    async def test_after_signing_it_points_to_the_client_portal(self, client, ctx) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        token = _token((await _enable(client, agency, owner, lead))["url"])
        sent = await _send_proposal(client, agency, owner, lead)
        signed = await client.post(
            f"/proposals/public/{_token(sent['share_url'])}/sign",
            json={
                "signer_name": "Jane Prospect",
                "signer_email": "jane@fjord.example",
                "consent": True,
                "document_hash": sent["document_hash"],
            },
        )
        assert signed.status_code == 200, signed.text

        page = (await client.get(f"/lead-portal/{token}")).json()
        assert page["is_client"] is True
        assert page["portal_login_url"].endswith("/portal/login")
        assert page["proposals"][0]["display_status"] == "signed"

    async def test_another_agency_cannot_manage_it(self, client, ctx, db_session) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        outsider = await make_user(db_session, full_name="Outsider")
        other = await make_agency(db_session, owner=outsider, name="Other")
        resp = await client.put(
            f"/agencies/{other.id}/leads/{lead['id']}/portal", json={}, headers=auth_headers(outsider)
        )
        assert resp.status_code == 404

    async def test_reply_before_the_portal_exists_is_refused(self, client, ctx) -> None:
        agency, owner = ctx
        lead = await _lead(client, agency, owner)
        resp = await client.post(
            f"/agencies/{agency.id}/leads/{lead['id']}/portal/messages",
            json={"body": "hi"},
            headers=auth_headers(owner),
        )
        assert resp.status_code == 409

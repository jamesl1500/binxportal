"""End-to-end: proposals that need the agency's countersignature, the
signed-record PDF (downloads and the email each party gets once a proposal
is complete)."""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from binx_api.modules.proposals.models import ProposalCountersignature
from tests.conftest import auth_headers
from tests.factories import add_agency_member, make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e

CHROME = {"user-agent": "Mozilla/5.0 (Chrome)"}


def _token(share_url: str) -> str:
    return parse_qs(urlparse(share_url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    member = await make_user(db_session, email="max@northlight.example", full_name="Max Member")
    await add_agency_member(db_session, agency=agency, user=member, role="member")
    client_row = await make_client(db_session, agency=agency)
    return agency, owner, member, client_row


async def _sent(client, agency, owner, *, countersign: bool, client_id=None) -> dict:
    created = await client.post(
        f"/agencies/{agency.id}/proposals",
        json={
            "title": "Brand refresh",
            "recipient_name": "Jane Prospect",
            "recipient_email": "jane@example.com",
            "client_id": str(client_id) if client_id else None,
            "requires_countersign": countersign,
            "line_items": [{"description": "Brand strategy", "quantity": "1", "unit_price_cents": 500000}],
        },
        headers=auth_headers(owner),
    )
    assert created.status_code == 201, created.text
    assert created.json()["requires_countersign"] is countersign
    sent = await client.post(
        f"/agencies/{agency.id}/proposals/{created.json()['id']}/send", json={}, headers=auth_headers(owner)
    )
    return sent.json()


async def _client_signs(client, sent: dict):
    return await client.post(
        f"/proposals/public/{_token(sent['share_url'])}/sign",
        json={
            "signer_name": "Jane Prospect",
            "signer_email": "jane@example.com",
            "consent": True,
            "document_hash": sent["document_hash"],
        },
        headers=CHROME,
    )


async def _countersign(client, agency, user, sent: dict, **overrides):
    body = {"consent": True, "document_hash": sent["document_hash"]} | overrides
    return await client.post(
        f"/agencies/{agency.id}/proposals/{sent['id']}/countersign", json=body, headers=auth_headers(user)
    )


class TestCountersign:
    async def test_client_signs_then_the_agency_countersigns(self, client, ctx, db_session, email_outbox) -> None:
        agency, owner, _member, _client_row = ctx
        sent = await _sent(client, agency, owner, countersign=True)

        # Can't countersign before the client signs.
        early = await _countersign(client, agency, owner, sent)
        assert early.status_code == 409

        signed = await _client_signs(client, sent)
        assert signed.status_code == 200, signed.text
        assert signed.json()["display_status"] == "awaiting_countersign"
        assert signed.json()["completed_at"] is None
        assert email_outbox == []  # nothing goes out until it's complete

        staff = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}", headers=auth_headers(owner))
        assert staff.json()["display_status"] == "awaiting_countersign"

        refused = await _countersign(client, agency, owner, sent, consent=False)
        assert refused.status_code == 422
        wrong = await _countersign(client, agency, owner, sent, document_hash="0" * 64)
        assert wrong.status_code == 409

        done = await _countersign(client, agency, owner, sent)
        assert done.status_code == 200, done.text
        body = done.json()
        assert body["display_status"] == "signed"
        assert body["completed_at"] is not None
        assert body["countersignature"]["signer_email"] == "olivia@northlight.example"

        row = (await db_session.execute(select(ProposalCountersignature))).scalar_one()
        assert row.document_hash == sent["document_hash"]

        again = await _countersign(client, agency, owner, sent)
        assert again.status_code == 409

        certificate = (await client.get(f"/proposals/public/{_token(sent['share_url'])}/certificate")).json()
        assert certificate["countersignature"]["signer_name"] == "Olivia Owner"
        assert [e["kind"] for e in certificate["events"]] == ["sent", "signed", "countersigned"]

        # Complete: each party gets the signed PDF, in their own email.
        assert sorted(m.to for m in email_outbox) == ["jane@example.com", "olivia@northlight.example"]
        for message in email_outbox:
            assert message.subject == "Signed: Brand refresh"
            [attachment] = message.attachments
            assert attachment.file_name == "Brand refresh - signed.pdf"
            assert attachment.content.startswith(b"%PDF")
        client_mail = next(m for m in email_outbox if m.to == "jane@example.com")
        assert "/proposals/public/certificate?token=" in client_mail.body
        assert "Olivia Owner for Northlight" in client_mail.body

    async def test_members_cannot_countersign(self, client, ctx) -> None:
        agency, owner, member, _client_row = ctx
        sent = await _sent(client, agency, owner, countersign=True)
        await _client_signs(client, sent)
        denied = await _countersign(client, agency, member, sent)
        assert denied.status_code == 403

    async def test_a_proposal_without_countersign_completes_on_the_clients_signature(
        self, client, ctx, email_outbox
    ) -> None:
        agency, owner, _member, _client_row = ctx
        sent = await _sent(client, agency, owner, countersign=False)
        signed = await _client_signs(client, sent)
        assert signed.json()["display_status"] == "signed"
        assert signed.json()["completed_at"] is not None
        assert sorted(m.to for m in email_outbox) == ["jane@example.com", "olivia@northlight.example"]

        not_needed = await _countersign(client, agency, owner, sent)
        assert not_needed.status_code == 409

    async def test_list_filters_on_awaiting_countersign(self, client, ctx) -> None:
        agency, owner, _member, _client_row = ctx
        sent = await _sent(client, agency, owner, countersign=True)
        await _client_signs(client, sent)
        listed = await client.get(
            f"/agencies/{agency.id}/proposals", params={"status": "awaiting_countersign"}, headers=auth_headers(owner)
        )
        assert [p["id"] for p in listed.json()] == [sent["id"]]


class TestCertificatePdf:
    async def test_downloads_for_staff_portal_and_share_link(self, client, ctx, db_session) -> None:
        agency, owner, _member, client_row = ctx
        contact = await make_user(db_session, email="dana@client.example", full_name="Dana Client")
        await make_client_contact(db_session, agency=agency, client=client_row, user=contact)
        sent = await _sent(client, agency, owner, countersign=False, client_id=client_row.id)
        token = _token(sent["share_url"])

        before = await client.get(f"/proposals/public/{token}/certificate.pdf")
        assert before.status_code == 409

        await _client_signs(client, sent)
        for url, headers in (
            (f"/proposals/public/{token}/certificate.pdf", {}),
            (f"/agencies/{agency.id}/proposals/{sent['id']}/certificate.pdf", auth_headers(owner)),
            (f"/portal/proposals/{sent['id']}/certificate.pdf", auth_headers(contact)),
        ):
            response = await client.get(url, headers=headers)
            assert response.status_code == 200, (url, response.text)
            assert response.headers["content-type"] == "application/pdf"
            assert response.content.startswith(b"%PDF")
            assert 'filename="Brand refresh - signed.pdf"' in response.headers["content-disposition"]

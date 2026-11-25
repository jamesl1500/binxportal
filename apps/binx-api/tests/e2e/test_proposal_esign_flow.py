"""End-to-end: what makes a proposal signature binding — the document
frozen and fingerprinted at send, consent and the matching fingerprint
required to sign, the audit trail, and the signing certificate read from the
frozen snapshot (staff, client portal and share link)."""

from __future__ import annotations

import hashlib
import json
import re
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select, update

from binx_api.modules.proposals import signing
from binx_api.modules.proposals.models import Proposal, ProposalLineItem, ProposalSignature
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e

PDF = b"%PDF-1.7 statement of work"
CHROME = {"user-agent": "Mozilla/5.0 (Chrome)"}
SAFARI = {"user-agent": "Mozilla/5.0 (Safari)"}


def _token(share_url: str) -> str:
    return parse_qs(urlparse(share_url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    client_row = await make_client(db_session, agency=agency)
    return agency, owner, client_row


async def _sent(client, agency, owner, *, client_id=None, attach=True) -> dict:
    created = await client.post(
        f"/agencies/{agency.id}/proposals",
        json={
            "title": "Brand refresh",
            "recipient_name": "Jane Prospect",
            "recipient_email": "jane@example.com",
            "client_id": str(client_id) if client_id else None,
            "content": "Scope: strategy and identity.",
            "line_items": [
                {
                    "description": "Brand strategy",
                    "details": "Two workshops",
                    "quantity": "1",
                    "unit_price_cents": 500000,
                }
            ],
        },
        headers=auth_headers(owner),
    )
    assert created.status_code == 201, created.text
    proposal = created.json()
    if attach:
        uploaded = await client.post(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/attachments",
            files={"file": ("sow.pdf", PDF, "application/pdf")},
            headers=auth_headers(owner),
        )
        assert uploaded.status_code == 201
    sent = await client.post(
        f"/agencies/{agency.id}/proposals/{proposal['id']}/send", json={}, headers=auth_headers(owner)
    )
    assert sent.status_code == 200, sent.text
    return sent.json()


async def _sign(client, token: str, document_hash: str | None, *, consent=True, headers=None):
    return await client.post(
        f"/proposals/public/{token}/sign",
        json={
            "signer_name": "Jane Prospect",
            "signer_email": "jane@example.com",
            "consent": consent,
            "document_hash": document_hash,
        },
        headers=headers or CHROME,
    )


class TestDocumentRecord:
    async def test_sending_freezes_a_fingerprinted_snapshot(self, client, ctx, db_session, fake_s3) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner)
        assert re.fullmatch(r"[0-9a-f]{64}", sent["document_hash"])
        assert sent["consent_text"] == signing.CONSENT_TEXT
        assert sent["consent_version"] == signing.CONSENT_VERSION

        row = await db_session.get(Proposal, sent["id"])
        snapshot = json.loads(row.document_snapshot)
        assert hashlib.sha256(row.document_snapshot.encode()).hexdigest() == sent["document_hash"]
        assert snapshot["line_items"][0]["details"] == "Two workshops"
        assert snapshot["attachments"] == [
            {"file_name": "sow.pdf", "size": len(PDF), "sha256": hashlib.sha256(PDF).hexdigest()}
        ]
        assert snapshot["recipient_email"] == "jane@example.com"
        # The same proposal always produces the same bytes.
        assert await signing.build_snapshot(db_session, row) == row.document_snapshot

    async def test_drafts_have_no_fingerprint(self, client, ctx) -> None:
        agency, owner, _client_row = ctx
        draft = await client.post(
            f"/agencies/{agency.id}/proposals", json={"title": "Draft"}, headers=auth_headers(owner)
        )
        assert draft.json()["document_hash"] is None

    async def test_a_proposal_sent_before_fingerprints_gets_one_when_opened(
        self, client, ctx, db_session, fake_s3
    ) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner, attach=False)
        await db_session.execute(
            update(Proposal).where(Proposal.id == sent["id"]).values(document_hash=None, document_snapshot=None)
        )
        await db_session.commit()

        public = await client.get(f"/proposals/public/{_token(sent['share_url'])}", headers=CHROME)
        assert public.json()["document_hash"] == sent["document_hash"]


class TestSigning:
    async def test_signing_needs_consent_and_the_fingerprint_shown(self, client, ctx, db_session, fake_s3) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner)
        token = _token(sent["share_url"])

        no_consent = await _sign(client, token, sent["document_hash"], consent=False)
        assert no_consent.status_code == 422
        assert "sign electronically" in no_consent.json()["detail"]

        wrong_version = await _sign(client, token, "0" * 64)
        assert wrong_version.status_code == 409
        missing = await _sign(client, token, None)
        assert missing.status_code == 409

        signed = await _sign(client, token, sent["document_hash"])
        assert signed.status_code == 200, signed.text
        assert signed.json()["signature"]["signed_via"] == "link"

        signature = (await db_session.execute(select(ProposalSignature))).scalar_one()
        assert signature.consent_text == signing.CONSENT_TEXT
        assert signature.consent_version == signing.CONSENT_VERSION
        assert signature.document_hash == sent["document_hash"]
        assert signature.user_agent == "Mozilla/5.0 (Chrome)"

    async def test_portal_signing_needs_consent_too(self, client, ctx, db_session, fake_s3) -> None:
        agency, owner, client_row = ctx
        contact = await make_user(db_session, email="dana@client.example", full_name="Dana Client")
        await make_client_contact(db_session, agency=agency, client=client_row, user=contact)
        sent = await _sent(client, agency, owner, client_id=client_row.id)

        refused = await client.post(
            f"/portal/proposals/{sent['id']}/sign",
            json={"consent": False, "document_hash": sent["document_hash"]},
            headers=auth_headers(contact),
        )
        assert refused.status_code == 422
        signed = await client.post(
            f"/portal/proposals/{sent['id']}/sign",
            json={"consent": True, "document_hash": sent["document_hash"]},
            headers={**auth_headers(contact), **SAFARI},
        )
        assert signed.status_code == 200, signed.text
        assert signed.json()["signature"]["signed_via"] == "portal"

        certificate = await client.get(f"/portal/proposals/{sent['id']}/certificate", headers=auth_headers(contact))
        assert certificate.status_code == 200
        body = certificate.json()
        assert body["signature"]["signer_email"] == "dana@client.example"
        assert body["signature"]["user_agent"] == "Mozilla/5.0 (Safari)"
        kinds = [event["kind"] for event in body["events"]]
        assert kinds == ["sent", "signed"]


class TestAuditTrail:
    async def test_views_are_logged_once_per_browser_and_signing_is_logged(
        self, client, ctx, db_session, fake_s3
    ) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner)
        token = _token(sent["share_url"])

        await client.get(f"/proposals/public/{token}", headers=CHROME)
        await client.get(f"/proposals/public/{token}", headers=CHROME)  # a reload: no new row
        await client.get(f"/proposals/public/{token}", headers=SAFARI)  # another browser: logged
        await _sign(client, token, sent["document_hash"])

        events = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}/events", headers=auth_headers(owner))
        trail = [(e["kind"], e["user_agent"]) for e in events.json()]
        assert trail == [
            ("sent", None),
            ("viewed", "Mozilla/5.0 (Chrome)"),
            ("viewed", "Mozilla/5.0 (Safari)"),
            ("signed", "Mozilla/5.0 (Chrome)"),
        ]
        assert events.json()[0]["actor_label"] == "Olivia Owner"
        assert events.json()[0]["detail"] == "Sent to jane@example.com"
        assert events.json()[-1]["actor_label"] == "Jane Prospect <jane@example.com>"

    async def test_a_decline_is_logged_with_its_reason(self, client, ctx, fake_s3) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner)
        declined = await client.post(
            f"/proposals/public/{_token(sent['share_url'])}/decline", json={"reason": "Over budget"}, headers=CHROME
        )
        assert declined.json()["status"] == "declined"
        events = await client.get(f"/agencies/{agency.id}/proposals/{sent['id']}/events", headers=auth_headers(owner))
        assert events.json()[-1]["kind"] == "declined"
        assert events.json()[-1]["detail"] == "Over budget"

    async def test_another_agency_cannot_read_the_trail(self, client, ctx, db_session, fake_s3) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner)
        outsider = await make_user(db_session, full_name="Outsider")
        other = await make_agency(db_session, owner=outsider, name="Other")
        resp = await client.get(f"/agencies/{other.id}/proposals/{sent['id']}/events", headers=auth_headers(outsider))
        assert resp.status_code == 404


class TestCertificate:
    async def test_not_available_until_signed(self, client, ctx, fake_s3) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner)
        staff = await client.get(
            f"/agencies/{agency.id}/proposals/{sent['id']}/certificate", headers=auth_headers(owner)
        )
        assert staff.status_code == 409
        public = await client.get(f"/proposals/public/{_token(sent['share_url'])}/certificate")
        assert public.status_code == 409

    async def test_reads_the_signed_snapshot_not_todays_rows(self, client, ctx, db_session, fake_s3) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner)
        token = _token(sent["share_url"])
        await _sign(client, token, sent["document_hash"])

        # Someone edits the live row behind the app's back...
        await db_session.execute(
            update(ProposalLineItem)
            .where(ProposalLineItem.proposal_id == sent["id"])
            .values(description="Something else", unit_price_cents=1)
        )
        await db_session.commit()

        certificate = (await client.get(f"/proposals/public/{token}/certificate")).json()
        # ...but the certificate shows what was actually signed.
        assert certificate["line_items"][0]["description"] == "Brand strategy"
        assert certificate["line_items"][0]["unit_price_cents"] == 500000
        assert certificate["attachments"][0]["sha256"] == hashlib.sha256(PDF).hexdigest()
        assert certificate["document_hash"] == sent["document_hash"]
        assert certificate["document_intact"] is True
        assert certificate["signature_matches_document"] is True
        assert certificate["signature"]["consent_text"] == signing.CONSENT_TEXT
        assert certificate["agency_name"] == "Northlight"
        assert [e["kind"] for e in certificate["events"]] == ["sent", "signed"]

        staff = await client.get(
            f"/agencies/{agency.id}/proposals/{sent['id']}/certificate", headers=auth_headers(owner)
        )
        assert staff.json()["document_hash"] == sent["document_hash"]

    async def test_a_tampered_snapshot_is_flagged(self, client, ctx, db_session, fake_s3) -> None:
        agency, owner, _client_row = ctx
        sent = await _sent(client, agency, owner)
        token = _token(sent["share_url"])
        await _sign(client, token, sent["document_hash"])

        row = await db_session.get(Proposal, sent["id"])
        tampered = row.document_snapshot.replace("500000", "1")
        await db_session.execute(update(Proposal).where(Proposal.id == sent["id"]).values(document_snapshot=tampered))
        await db_session.commit()
        db_session.expire_all()  # the app reads a fresh row per request; so must this shared test session

        certificate = (await client.get(f"/proposals/public/{token}/certificate")).json()
        assert certificate["document_intact"] is False

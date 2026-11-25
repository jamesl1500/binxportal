"""End-to-end: documents attached to a proposal — uploaded on a draft,
frozen once sent, and downloadable by staff, the portal client, and the
public share link (but never while the proposal is still a draft)."""

from __future__ import annotations

import hashlib
from urllib.parse import parse_qs, urlparse

import pytest

from binx_api.modules.proposals import service as proposals_service
from binx_api.modules.proposals.models import MAX_PROPOSAL_ATTACHMENTS
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e

PDF = b"%PDF-1.7 fake contract body"


def _token(share_url: str) -> str:
    return parse_qs(urlparse(share_url).query)["token"][0]


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner)
    client_row = await make_client(db_session, agency=agency)
    return agency, owner, client_row


async def _draft(client, agency_id, owner, client_id=None) -> dict:
    resp = await client.post(
        f"/agencies/{agency_id}/proposals",
        json={
            "title": "Brand refresh",
            "recipient_email": "jane@example.com",
            "client_id": str(client_id) if client_id else None,
            "line_items": [{"description": "Brand strategy", "quantity": "1", "unit_price_cents": 500000}],
        },
        headers=auth_headers(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _upload(client, agency_id, proposal_id, owner, name="contract.pdf", body=PDF, mime="application/pdf"):
    return await client.post(
        f"/agencies/{agency_id}/proposals/{proposal_id}/attachments",
        files={"file": (name, body, mime)},
        headers=auth_headers(owner),
    )


class TestProposalAttachments:
    async def test_upload_send_and_download_everywhere(self, client, ctx, fake_s3, db_session) -> None:
        agency, owner, client_row = ctx
        proposal = await _draft(client, agency.id, owner, client_id=client_row.id)
        base = f"/agencies/{agency.id}/proposals/{proposal['id']}"

        uploaded = await _upload(client, agency.id, proposal["id"], owner)
        assert uploaded.status_code == 201, uploaded.text
        attachment = uploaded.json()
        assert attachment["file_name"] == "contract.pdf"
        assert attachment["size"] == len(PDF)
        assert attachment["sha256"] == hashlib.sha256(PDF).hexdigest()

        # Stored under the agency's own prefix (so the agency purge sweeps it),
        # with a key that never includes the uploaded file name.
        [key] = fake_s3.keys()
        assert key.startswith(f"agencies/{agency.id}/proposals/{proposal['id']}/")
        assert "contract" not in key

        detail = await client.get(base, headers=auth_headers(owner))
        assert [a["id"] for a in detail.json()["attachments"]] == [attachment["id"]]

        staff_dl = await client.get(f"{base}/attachments/{attachment['id']}/download", headers=auth_headers(owner))
        assert staff_dl.status_code == 200
        assert staff_dl.content == PDF

        token = _token(proposal["share_url"])
        # A draft's attachments aren't public yet.
        assert (await client.get(f"/proposals/public/{token}/attachments/{attachment['id']}")).status_code == 404

        sent = await client.post(f"{base}/send", json={}, headers=auth_headers(owner))
        assert sent.status_code == 200

        public = await client.get(f"/proposals/public/{token}")
        assert [a["file_name"] for a in public.json()["attachments"]] == ["contract.pdf"]
        public_dl = await client.get(f"/proposals/public/{token}/attachments/{attachment['id']}")
        assert public_dl.status_code == 200
        assert public_dl.content == PDF
        assert "attachment" in public_dl.headers["content-disposition"]

        contact_user = await make_user(db_session, full_name="Dana Client")
        await make_client_contact(db_session, agency=agency, client=client_row, user=contact_user)
        portal_dl = await client.get(
            f"/portal/proposals/{proposal['id']}/attachments/{attachment['id']}", headers=auth_headers(contact_user)
        )
        assert portal_dl.status_code == 200
        assert portal_dl.content == PDF

        # Frozen once sent.
        late = await _upload(client, agency.id, proposal["id"], owner, name="extra.pdf")
        assert late.status_code == 409
        removed = await client.delete(f"{base}/attachments/{attachment['id']}", headers=auth_headers(owner))
        assert removed.status_code == 409

    async def test_remove_on_draft_deletes_the_bytes(self, client, ctx, fake_s3) -> None:
        agency, owner, _client_row = ctx
        proposal = await _draft(client, agency.id, owner)
        attachment = (await _upload(client, agency.id, proposal["id"], owner)).json()
        assert len(fake_s3.keys()) == 1

        resp = await client.delete(
            f"/agencies/{agency.id}/proposals/{proposal['id']}/attachments/{attachment['id']}",
            headers=auth_headers(owner),
        )
        assert resp.status_code == 204
        assert fake_s3.keys() == []

    async def test_deleting_a_draft_deletes_its_attachments(self, client, ctx, fake_s3) -> None:
        agency, owner, _client_row = ctx
        proposal = await _draft(client, agency.id, owner)
        await _upload(client, agency.id, proposal["id"], owner)
        await _upload(client, agency.id, proposal["id"], owner, name="deck.pdf")
        assert len(fake_s3.keys()) == 2

        resp = await client.delete(f"/agencies/{agency.id}/proposals/{proposal['id']}", headers=auth_headers(owner))
        assert resp.status_code == 204
        assert fake_s3.keys() == []

    async def test_limits(self, client, ctx, fake_s3, monkeypatch) -> None:
        agency, owner, _client_row = ctx
        proposal = await _draft(client, agency.id, owner)

        empty = await _upload(client, agency.id, proposal["id"], owner, body=b"")
        assert empty.status_code == 422

        # monkeypatch.context(), not monkeypatch.undo(): undo() would also
        # revert fake_s3 and send the uploads below to local disk.
        with monkeypatch.context() as patch:
            patch.setattr(proposals_service.settings, "proposal_upload_max_bytes", 10)
            too_big = await _upload(client, agency.id, proposal["id"], owner, body=b"x" * 11)
        assert too_big.status_code == 413

        for i in range(MAX_PROPOSAL_ATTACHMENTS):
            ok = await _upload(client, agency.id, proposal["id"], owner, name=f"f{i}.pdf")
            assert ok.status_code == 201
        assert len(fake_s3.keys()) == MAX_PROPOSAL_ATTACHMENTS
        over = await _upload(client, agency.id, proposal["id"], owner, name="one-too-many.pdf")
        assert over.status_code == 409

    async def test_file_name_is_cleaned_and_type_guessed(self, client, ctx, fake_s3) -> None:
        agency, owner, _client_row = ctx
        proposal = await _draft(client, agency.id, owner)
        resp = await _upload(
            client,
            agency.id,
            proposal["id"],
            owner,
            name="C:\\fakepath\\Statement of work.pdf",
            mime="application/octet-stream",
        )
        assert resp.status_code == 201
        assert resp.json()["file_name"] == "Statement of work.pdf"
        assert resp.json()["mime_type"] == "application/pdf"

    async def test_other_agency_and_other_client_get_404(self, client, ctx, fake_s3, db_session) -> None:
        agency, owner, client_row = ctx
        proposal = await _draft(client, agency.id, owner, client_id=client_row.id)
        attachment = (await _upload(client, agency.id, proposal["id"], owner)).json()
        await client.post(f"/agencies/{agency.id}/proposals/{proposal['id']}/send", json={}, headers=auth_headers(owner))

        outsider = await make_user(db_session, full_name="Outsider")
        other_agency = await make_agency(db_session, owner=outsider, name="Other")
        resp = await client.get(
            f"/agencies/{other_agency.id}/proposals/{proposal['id']}/attachments/{attachment['id']}/download",
            headers=auth_headers(outsider),
        )
        assert resp.status_code == 404

        other_client = await make_client(db_session, agency=agency, name="Someone Else")
        other_contact = await make_user(db_session, full_name="Other Contact")
        await make_client_contact(db_session, agency=agency, client=other_client, user=other_contact)
        portal = await client.get(
            f"/portal/proposals/{proposal['id']}/attachments/{attachment['id']}", headers=auth_headers(other_contact)
        )
        assert portal.status_code == 404

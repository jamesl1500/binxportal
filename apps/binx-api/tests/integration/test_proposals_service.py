"""Integration tests for binx_api.modules.proposals.service — status
transitions (draft -> sent -> signed/declined), the expiry display state, and
the token-scoped public lookup.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException

from binx_api.modules.proposals import service
from binx_api.modules.proposals.models import STATUS_DECLINED, STATUS_DRAFT, STATUS_SENT, STATUS_SIGNED
from binx_api.modules.proposals.schemas import ProposalLineItemInput
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.integration


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Owner")
    agency = await make_agency(db_session, owner=owner)
    client = await make_client(db_session, agency=agency)
    return owner, agency, client


async def _make_proposal(db_session, agency, owner, **overrides):
    defaults = {
        "lead_id": None,
        "client_id": None,
        "title": "Website redesign",
        "recipient_name": "Jane Prospect",
        "recipient_email": "jane@example.com",
        "content": "Scope of work",
        "currency": "USD",
        "tax_rate_percent": Decimal("0"),
        "valid_until": None,
        "line_items": [ProposalLineItemInput(description="Design", quantity=Decimal("1"), unit_price_cents=200_000)],
    }
    defaults.update(overrides)
    return await service.create_proposal(db_session, agency, created_by=owner, **defaults)


class TestCreateProposal:
    async def test_totals_are_computed(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(
            db_session,
            agency,
            owner,
            tax_rate_percent=Decimal("10"),
            line_items=[
                ProposalLineItemInput(description="Design", quantity=Decimal("2"), unit_price_cents=100_000),
            ],
        )
        assert proposal.subtotal_cents == 200_000
        assert proposal.tax_cents == 20_000
        assert proposal.total_cents == 220_000
        assert proposal.status == STATUS_DRAFT
        assert proposal.share_token  # generated, non-empty


class TestSendSignDecline:
    async def test_full_lifecycle_sign(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(db_session, agency, owner)

        sent = await service.send_proposal(db_session, proposal, sent_by=owner, recipient_email=None)
        assert sent.status == STATUS_SENT
        assert sent.sent_at is not None

        fetched, _agency_row = await service.get_public_proposal(db_session, proposal.share_token)
        assert fetched.status == "viewed"  # first public view flips sent -> viewed

        signed = await service.sign_proposal(
            db_session, fetched, signer_name="Jane Prospect", signer_email="jane@example.com", ip_address="1.2.3.4"
        )
        assert signed.status == STATUS_SIGNED
        assert signed.decided_at is not None

        signature = await service.get_signature(db_session, proposal.id)
        assert signature is not None
        assert signature.signer_email == "jane@example.com"

        # Closed — can't sign or decline again.
        with pytest.raises(HTTPException) as exc:
            await service.decline_proposal(db_session, signed, reason="changed my mind")
        assert exc.value.status_code == 409

    async def test_decline_records_reason(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(db_session, agency, owner)
        await service.send_proposal(db_session, proposal, sent_by=owner, recipient_email=None)

        declined = await service.decline_proposal(db_session, proposal, reason="Going with someone else")
        assert declined.status == STATUS_DECLINED
        assert declined.decline_reason == "Going with someone else"

    async def test_cannot_send_without_line_items(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(db_session, agency, owner, line_items=[])
        with pytest.raises(HTTPException) as exc:
            await service.send_proposal(db_session, proposal, sent_by=owner, recipient_email=None)
        assert exc.value.status_code == 409

    async def test_cannot_send_without_recipient_email(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(db_session, agency, owner, recipient_email=None)
        with pytest.raises(HTTPException) as exc:
            await service.send_proposal(db_session, proposal, sent_by=owner, recipient_email=None)
        assert exc.value.status_code == 409

    async def test_edit_blocked_once_sent(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(db_session, agency, owner)
        await service.send_proposal(db_session, proposal, sent_by=owner, recipient_email=None)

        with pytest.raises(HTTPException) as exc:
            await service.update_proposal(
                db_session,
                proposal,
                lead_id=None,
                client_id=None,
                title="New title",
                recipient_name=None,
                recipient_email="jane@example.com",
                content=None,
                currency="USD",
                tax_rate_percent=Decimal("0"),
                valid_until=None,
                line_items=[ProposalLineItemInput(description="X", quantity=Decimal("1"), unit_price_cents=100)],
            )
        assert exc.value.status_code == 409


class TestExpiry:
    async def test_expired_display_status(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(db_session, agency, owner, valid_until=datetime.now(UTC) - timedelta(days=1))
        await service.send_proposal(db_session, proposal, sent_by=owner, recipient_email=None)

        assert service.display_status(proposal) == "expired"

        with pytest.raises(HTTPException) as exc:
            await service.sign_proposal(
                db_session, proposal, signer_name="Jane", signer_email="jane@example.com", ip_address=None
            )
        assert exc.value.status_code == 409

    async def test_draft_not_reachable_by_token(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(db_session, agency, owner)
        with pytest.raises(HTTPException) as exc:
            await service.get_public_proposal(db_session, proposal.share_token)
        assert exc.value.status_code == 404


class TestListAndDelete:
    async def test_list_filters_by_status(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        draft = await _make_proposal(db_session, agency, owner, title="Draft one")
        sent = await _make_proposal(db_session, agency, owner, title="Sent one")
        await service.send_proposal(db_session, sent, sent_by=owner, recipient_email=None)

        drafts = await service.list_proposals(db_session, agency.id, status_filter="draft")
        assert [p[0].id for p in drafts] == [draft.id]

    async def test_delete_only_allowed_for_draft(self, db_session, ctx) -> None:
        owner, agency, _client = ctx
        proposal = await _make_proposal(db_session, agency, owner)
        await service.send_proposal(db_session, proposal, sent_by=owner, recipient_email=None)

        with pytest.raises(HTTPException) as exc:
            await service.delete_proposal(db_session, proposal, actor=owner)
        assert exc.value.status_code == 409

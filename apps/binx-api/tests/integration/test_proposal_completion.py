"""What a signature sets off once a proposal is complete (completion.py):
deferred out of the signing request, claimed so it runs once, and swept up
again when a crash or restart left it behind."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from binx_api.modules.proposals import acceptance, completion
from binx_api.modules.proposals import service as proposals_service
from binx_api.modules.proposals.models import Proposal, ProposalAcceptance
from binx_api.modules.proposals.schemas import ProposalLineItemInput
from tests.factories import make_agency, make_client, make_user

pytestmark = pytest.mark.integration


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, email="olivia@northlight.example", full_name="Olivia Owner")
    agency = await make_agency(db_session, owner=owner, name="Northlight")
    client = await make_client(db_session, agency=agency, name="Fjord & Field")
    return agency, owner, client


async def _sent(db, agency, owner, *, client_id=None, requires_countersign=False) -> Proposal:
    proposal = await proposals_service.create_proposal(
        db,
        agency,
        created_by=owner,
        lead_id=None,
        client_id=client_id,
        title="Brand refresh",
        recipient_name="Jane Prospect",
        recipient_email="jane@fjord.example",
        content=None,
        currency="USD",
        tax_rate_percent=Decimal("0"),
        valid_until=None,
        line_items=[ProposalLineItemInput(description="Strategy", quantity=Decimal("1"), unit_price_cents=100_000)],
        requires_countersign=requires_countersign,
    )
    return await proposals_service.send_proposal(db, proposal, sent_by=owner, recipient_email=None)


async def _sign(db, proposal: Proposal) -> Proposal:
    return await proposals_service.sign_proposal(
        db,
        proposal,
        signer_name="Jane Prospect",
        signer_email="jane@fjord.example",
        ip_address="203.0.113.5",
        consent=True,
        document_hash=proposal.document_hash,
    )


def _signed_record_emails(outbox) -> list[str]:
    return [m.to for m in outbox if m.subject == "Signed: Brand refresh"]


class TestDeferred:
    async def test_signing_saves_the_signature_and_leaves_the_follow_up_for_later(
        self, db_session, ctx, email_outbox
    ) -> None:
        agency, owner, client = ctx
        proposal = await _signed_proposal(db_session, agency, owner, client)

        assert proposal.completed_at is not None
        assert proposal.completion_processed_at is None
        # The agency sees it being set up straight away...
        row = await acceptance.get_acceptance(db_session, proposal.id)
        assert row is not None and row.status == "in_progress"
        # ...but nothing has run yet.
        assert _signed_record_emails(email_outbox) == []

        assert await completion.process(db_session, proposal.id) is True
        row = await db_session.get(ProposalAcceptance, row.id, populate_existing=True)
        assert row.status == "done"
        assert sorted(_signed_record_emails(email_outbox)) == ["jane@fjord.example", "olivia@northlight.example"]
        proposal = await db_session.get(Proposal, proposal.id, populate_existing=True)
        assert proposal.completion_processed_at is not None

    async def test_it_runs_once(self, db_session, ctx, email_outbox) -> None:
        agency, owner, client = ctx
        proposal = await _signed_proposal(db_session, agency, owner, client)
        assert await completion.process(db_session, proposal.id) is True
        assert await completion.process(db_session, proposal.id) is False
        assert len(_signed_record_emails(email_outbox)) == 2

    async def test_a_claim_in_progress_is_left_alone_until_it_times_out(self, db_session, ctx, email_outbox) -> None:
        agency, owner, client = ctx
        proposal = await _signed_proposal(db_session, agency, owner, client)
        proposal.completion_claimed_at = datetime.now(UTC) - timedelta(minutes=1)
        await db_session.commit()
        assert await completion.process(db_session, proposal.id) is False

        proposal.completion_claimed_at = datetime.now(UTC) - completion.CLAIM_TIMEOUT - timedelta(minutes=1)
        await db_session.commit()
        assert await completion.process(db_session, proposal.id) is True
        assert len(_signed_record_emails(email_outbox)) == 2

    async def test_a_standalone_proposal_gets_its_signed_record_but_no_acceptance(
        self, db_session, ctx, email_outbox
    ) -> None:
        agency, owner, _client = ctx
        proposal = await _sent(db_session, agency, owner)
        proposal = await _sign(db_session, proposal)
        assert await acceptance.get_acceptance(db_session, proposal.id) is None
        assert await completion.process(db_session, proposal.id) is True
        assert await acceptance.get_acceptance(db_session, proposal.id) is None
        assert len(_signed_record_emails(email_outbox)) == 2

    async def test_the_countersigner_gets_the_agency_copy(self, db_session, ctx, email_outbox) -> None:
        agency, owner, client = ctx
        admin = await make_user(db_session, email="ada@northlight.example", full_name="Ada Admin")
        proposal = await _sent(db_session, agency, owner, client_id=client.id, requires_countersign=True)
        proposal = await _sign(db_session, proposal)
        assert proposal.completed_at is None
        assert await completion.process(db_session, proposal.id) is False  # not complete yet

        proposal = await proposals_service.countersign_proposal(
            db_session,
            proposal,
            user=admin,
            ip_address=None,
            user_agent=None,
            consent=True,
            document_hash=proposal.document_hash,
        )
        assert proposal.completed_at is not None
        assert await completion.process(db_session, proposal.id) is True
        assert sorted(_signed_record_emails(email_outbox)) == ["ada@northlight.example", "jane@fjord.example"]


async def _signed_proposal(db, agency, owner, client) -> Proposal:
    proposal = await _sent(db, agency, owner, client_id=client.id)
    return await _sign(db, proposal)


class TestSweep:
    async def test_it_finishes_what_was_left_behind_and_skips_the_rest(self, db_session, ctx, email_outbox) -> None:
        agency, owner, client = ctx
        left_behind = await _signed_proposal(db_session, agency, owner, client)
        just_signed = await _signed_proposal(db_session, agency, owner, client)
        done = await _signed_proposal(db_session, agency, owner, client)
        await completion.process(db_session, done.id)
        email_outbox.clear()

        # The sweep looks from a little in the future: the first proposal's
        # request should have finished it long ago, the second's still might.
        later = datetime.now(UTC) + completion.SWEEP_GRACE + timedelta(seconds=30)
        just_signed.completed_at = later - timedelta(seconds=10)
        await db_session.commit()

        assert await completion.sweep(now=later) == 1
        processed = {
            row.id: row.completion_processed_at
            for row in (
                await db_session.execute(
                    select(Proposal)
                    .where(Proposal.id.in_([left_behind.id, just_signed.id]))
                    .execution_options(populate_existing=True)
                )
            ).scalars()
        }
        assert processed[left_behind.id] is not None
        assert processed[just_signed.id] is None
        assert len(_signed_record_emails(email_outbox)) == 2

    async def test_one_failure_does_not_stop_the_rest(self, db_session, ctx, monkeypatch) -> None:
        agency, owner, client = ctx
        first = await _signed_proposal(db_session, agency, owner, client)
        second = await _signed_proposal(db_session, agency, owner, client)
        real_process = completion.process

        async def flaky(db, proposal_id):
            if proposal_id == first.id:
                raise RuntimeError("boom")
            return await real_process(db, proposal_id)

        monkeypatch.setattr(completion, "process", flaky)
        later = datetime.now(UTC) + completion.SWEEP_GRACE + timedelta(seconds=30)
        assert await completion.sweep(now=later) == 1
        second = await db_session.get(Proposal, second.id, populate_existing=True)
        assert second.completion_processed_at is not None

"""What happens when a proposal becomes complete: every required signature
is in (the client's, plus the agency's countersignature when required).

1. Acceptance (acceptance.py): for a proposal to a lead or a client, set up
   the client relationship (client, portal invite, deposit, project,
   kickoff, monthly billing).
2. The signed record: each party gets the signed PDF by email.

This runs after the signing request has answered (``schedule``), so a
signature returns as soon as it's saved instead of waiting on a hundred
database round trips and the emails. It's claimed before it runs, so it runs
once even if the sweep (``sweep``, from the background loop) finds it at the
same time, and the sweep picks up any that a crash or restart left behind.

Nothing here ever undoes a signature: a step that fails is reported (and
acceptance records why it's blocked, for a retry), and the signed record
stays downloadable from the certificate pages.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi import BackgroundTasks
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import email as email_service
from binx_api.core.config import get_settings
from binx_api.core.database import async_session_factory
from binx_api.core.errors import capture_error
from binx_api.modules.proposals import acceptance, signing
from binx_api.modules.proposals.certificate_pdf import certificate_file_name, render_certificate_pdf
from binx_api.modules.proposals.models import (
    ACCEPTANCE_IN_PROGRESS,
    Proposal,
    ProposalAcceptance,
    ProposalCountersignature,
)
from binx_api.modules.users.models import User

logger = logging.getLogger(__name__)
settings = get_settings()

# The session the after-response work opens (the request's is closed by
# then). Swapped out under test, see tests/conftest.py.
session_factory: Callable[[], AsyncSession] = async_session_factory

# A claim older than this is taken to be abandoned (the process died).
CLAIM_TIMEOUT = timedelta(minutes=10)
# The sweep leaves a just-completed proposal to its own request for this long.
SWEEP_GRACE = timedelta(minutes=2)
SWEEP_INTERVAL_SECONDS = 60
SWEEP_BATCH = 25


def public_certificate_url(proposal: Proposal) -> str:
    return f"{settings.frontend_url}/proposals/public/certificate?token={proposal.share_token}"


def staff_certificate_url(proposal: Proposal) -> str:
    return f"{settings.frontend_url}/proposals/{proposal.id}/certificate"


def mark_complete(db: AsyncSession, proposal: Proposal, now: datetime) -> None:
    """Records that every signature is in (the caller commits, with the
    signature). A proposal for a lead or client gets its acceptance row
    right away, so the agency sees it being set up before the work runs."""
    proposal.completed_at = now
    if proposal.lead_id is not None or proposal.client_id is not None:
        db.add(ProposalAcceptance(proposal_id=proposal.id, status=ACCEPTANCE_IN_PROGRESS))


def schedule(background_tasks: BackgroundTasks, proposal: Proposal) -> None:
    """Runs the completion work after the response, when there is any."""
    if proposal.completed_at is not None and proposal.completion_processed_at is None:
        background_tasks.add_task(process_after_response, proposal.id)


async def _claim(db: AsyncSession, proposal_id: uuid.UUID, now: datetime) -> bool:
    claimed = await db.scalar(
        update(Proposal)
        .where(
            Proposal.id == proposal_id,
            Proposal.completed_at.is_not(None),
            Proposal.completion_processed_at.is_(None),
            or_(Proposal.completion_claimed_at.is_(None), Proposal.completion_claimed_at < now - CLAIM_TIMEOUT),
        )
        .values(completion_claimed_at=now)
        .returning(Proposal.id)
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return claimed is not None


async def _agency_email(db: AsyncSession, proposal: Proposal) -> str | None:
    """Who gets the agency's copy: the countersigner, or whoever drafted it."""
    counter = await db.scalar(
        select(ProposalCountersignature.signer_email).where(ProposalCountersignature.proposal_id == proposal.id)
    )
    if counter:
        return counter
    if proposal.created_by_id is None:
        return None
    return await db.scalar(select(User.email).where(User.id == proposal.created_by_id))


async def process(db: AsyncSession, proposal_id: uuid.UUID) -> bool:
    """Runs a completed proposal's follow-up: acceptance, then the signed
    record. False when there's nothing to do (already done, or claimed by a
    run still in progress)."""
    if not await _claim(db, proposal_id, datetime.now(UTC)):
        return False
    proposal = await db.get(Proposal, proposal_id, populate_existing=True)
    assert proposal is not None
    await acceptance.accept(db, proposal)  # fails soft: a blocked step is recorded for a retry
    # Acceptance can roll the session back on a failure, which expires the
    # proposal; load it again.
    proposal = await db.get(Proposal, proposal_id, populate_existing=True)
    assert proposal is not None
    await send_signed_record(db, proposal, agency_email=await _agency_email(db, proposal))
    proposal.completion_processed_at = datetime.now(UTC)
    await db.commit()
    return True


async def process_after_response(proposal_id: uuid.UUID) -> None:
    try:
        async with session_factory() as db:
            await process(db, proposal_id)
    except Exception as exc:  # noqa: BLE001 - reported; the sweep runs it again once the claim times out
        await capture_error(exc, tags={"job": "proposal_completion"}, context={"proposal_id": str(proposal_id)})


async def sweep(*, now: datetime | None = None) -> int:
    """Runs the follow-up for complete proposals that it never ran for (a
    crash or restart after the signature was saved). Returns how many ran."""
    now = now or datetime.now(UTC)
    async with session_factory() as db:
        ids = (
            await db.scalars(
                select(Proposal.id)
                .where(
                    Proposal.completed_at.is_not(None),
                    Proposal.completed_at < now - SWEEP_GRACE,
                    Proposal.completion_processed_at.is_(None),
                    or_(
                        Proposal.completion_claimed_at.is_(None),
                        Proposal.completion_claimed_at < now - CLAIM_TIMEOUT,
                    ),
                )
                .order_by(Proposal.completed_at)
                .limit(SWEEP_BATCH)
            )
        ).all()
        ran = 0
        for proposal_id in ids:
            try:
                ran += await process(db, proposal_id)
            except Exception as exc:  # noqa: BLE001 - reported; one bad proposal mustn't stop the rest
                await db.rollback()
                await capture_error(exc, tags={"job": "proposal_completion"}, context={"proposal_id": str(proposal_id)})
        return ran


async def run_completion_loop() -> None:
    """The sweep, every minute, for the life of the process (main.py)."""
    while True:
        try:
            ran = await sweep()
            if ran:
                logger.info("Finished %d proposal completion(s) left behind", ran)
        except Exception as exc:  # noqa: BLE001 - the loop must survive a bad pass
            await capture_error(exc, tags={"job": "proposal_completion_sweep"})
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)


async def send_signed_record(db: AsyncSession, proposal: Proposal, *, agency_email: str | None) -> None:
    """Emails the signed PDF to the client signer and to the agency side (the
    countersigner, or whoever drafted the proposal). Fails soft."""
    try:
        certificate = await signing.build_certificate(db, proposal)
        pdf = render_certificate_pdf(certificate)
    except Exception as exc:  # noqa: BLE001 - reported; the signature itself is already saved
        await capture_error(exc, tags={"job": "proposal_signed_record"}, context={"proposal_id": str(proposal.id)})
        return

    signers = certificate.signature.signer_name
    if certificate.countersignature is not None:
        signers += f" and {certificate.countersignature.signer_name} for {certificate.agency_name}"
    name = certificate_file_name(certificate)
    recipients = [(certificate.signature.signer_email, public_certificate_url(proposal))]
    if agency_email and agency_email.casefold() != certificate.signature.signer_email.casefold():
        recipients.append((agency_email, staff_certificate_url(proposal)))
    for to, view_url in recipients:
        await email_service.send_proposal_signed_email(
            to=to,
            agency_name=certificate.agency_name,
            title=certificate.title,
            signer_names=signers,
            pdf=pdf,
            pdf_name=name,
            view_url=view_url,
        )

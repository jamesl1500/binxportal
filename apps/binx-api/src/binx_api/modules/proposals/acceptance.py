"""Accepting a proposal: what happens once it's complete (every required
signature is in), turning a signed proposal into a client relationship.

1. The client: the proposal's lead is converted into a client (or the
   proposal's existing client is used).
2. Portal access: the signer is invited to that client's portal (skipped
   when they already have it, e.g. they signed in the portal), with one
   welcome email that also points at any deposit.
3. The deposit: when the proposal sets ``deposit_percent``, a deposit
   invoice for that share of the total is issued; the client pays it in the
   portal (Stripe Connect when the agency has it).
4. The work: when ``create_project_on_accept``, a project for the client,
   and a kickoff questionnaire from ``kickoff_template_id``. With a deposit,
   this waits until the deposit is paid (``on_invoice_paid``). A kickoff
   needs a portal contact to send to, so it's sent once the signer joins
   (``on_contact_joined``) if they haven't yet.
5. The retainer: the proposal's monthly lines become a monthly recurring
   invoice schedule for the client (issued automatically, from the day the
   work starts, so also after any deposit).

Every step is idempotent and recorded in the proposal's history. A step
that can't run (most often a plan limit on clients or projects) leaves the
acceptance "blocked" with the reason, tells the proposal's owner, and can be
retried after the cause is fixed; nothing here ever undoes a signature.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import email as email_service
from binx_api.core.errors import capture_error
from binx_api.modules.agencies.models import ROLE_OWNER, Agency, AgencyClient, AgencyMember
from binx_api.modules.client_portal.models import ClientContact
from binx_api.modules.invoicing.models import STATUS_PAID, Invoice
from binx_api.modules.invoicing.recurring_schemas import RecurringLineItemInput
from binx_api.modules.invoicing.schemas import LineItemInput
from binx_api.modules.leads.models import Lead
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import CATEGORY_INVOICING as NOTIFY_CATEGORY_PROPOSALS
from binx_api.modules.proposals import options, signing
from binx_api.modules.proposals.models import (
    ACCEPTANCE_AWAITING_DEPOSIT,
    ACCEPTANCE_BLOCKED,
    ACCEPTANCE_DONE,
    ACCEPTANCE_IN_PROGRESS,
    BILLING_MONTHLY,
    EVENT_ACCEPTANCE_BLOCKED,
    EVENT_CLIENT_CREATED,
    EVENT_DEPOSIT_INVOICED,
    EVENT_DEPOSIT_PAID,
    EVENT_KICKOFF_SENT,
    EVENT_PORTAL_INVITED,
    EVENT_PROJECT_CREATED,
    EVENT_RETAINER_SCHEDULED,
    Proposal,
    ProposalAcceptance,
    ProposalSignature,
)
from binx_api.modules.users.models import User

logger = logging.getLogger(__name__)


class AcceptanceBlocked(Exception):
    """A step can't run; the message is shown to the agency."""


def _money(cents: int, currency: str) -> str:
    return f"{currency} {cents / 100:,.2f}"


def deposit_cents(proposal: Proposal) -> int:
    if not proposal.deposit_percent:
        return 0
    amount = Decimal(proposal.total_cents) * Decimal(proposal.deposit_percent) / Decimal(100)
    return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


async def get_acceptance(db: AsyncSession, proposal_id: uuid.UUID) -> ProposalAcceptance | None:
    return await db.scalar(select(ProposalAcceptance).where(ProposalAcceptance.proposal_id == proposal_id))


async def _actor(db: AsyncSession, proposal: Proposal) -> User:
    """Who acceptance acts as: the proposal's author, or the agency owner."""
    if proposal.created_by_id is not None:
        creator = await db.get(User, proposal.created_by_id)
        if creator is not None:
            return creator
    owner = await db.scalar(
        select(User)
        .join(AgencyMember, AgencyMember.user_id == User.id)
        .where(AgencyMember.agency_id == proposal.agency_id, AgencyMember.role == ROLE_OWNER)
        .limit(1)
    )
    if owner is None:
        raise AcceptanceBlocked("The agency has no owner to act for it")
    return owner


def _http_reason(exc: HTTPException) -> str:
    return exc.detail if isinstance(exc.detail, str) else "The step was refused"


# ---- Steps --------------------------------------------------------------------


async def _ensure_client(
    db: AsyncSession, proposal: Proposal, acceptance: ProposalAcceptance, agency: Agency, actor: User
) -> AgencyClient:
    from binx_api.modules.leads import service as leads_service

    if acceptance.client_id is not None:
        client = await db.get(AgencyClient, acceptance.client_id)
        if client is not None:
            return client
    if proposal.client_id is not None:
        client = await db.get(AgencyClient, proposal.client_id)
        if client is not None:
            acceptance.client_id = client.id
            await db.commit()
            return client
    if proposal.lead_id is None:
        raise AcceptanceBlocked("This proposal isn't for a lead or a client, so there's no one to set up")

    lead = await db.get(Lead, proposal.lead_id)
    if lead is None:
        raise AcceptanceBlocked("The lead this proposal was for has been deleted")
    if lead.converted_client_id is not None:
        client = await db.get(AgencyClient, lead.converted_client_id)
        if client is None:
            raise AcceptanceBlocked("The client this lead was converted to has been deleted")
    else:
        try:
            client = await leads_service.convert_lead(db, lead, agency, actor=actor)
        except HTTPException as exc:
            raise AcceptanceBlocked(f"Couldn't convert the lead to a client: {_http_reason(exc)}") from None
        acceptance.converted_lead = True
        signing.record_event(
            db,
            proposal.id,
            EVENT_CLIENT_CREATED,
            actor_label="Binx",
            detail=f"{lead.name} became a client",
        )

    proposal.client_id = client.id
    acceptance.client_id = client.id
    await db.commit()
    return client


async def _signer(db: AsyncSession, proposal: Proposal) -> ProposalSignature | None:
    return await db.scalar(select(ProposalSignature).where(ProposalSignature.proposal_id == proposal.id))


async def _is_contact(db: AsyncSession, client_id: uuid.UUID, email: str) -> bool:
    return (
        await db.scalar(
            select(ClientContact.id)
            .join(User, User.id == ClientContact.user_id)
            .where(ClientContact.client_id == client_id, func.lower(User.email) == email.lower())
            .limit(1)
        )
    ) is not None


async def _invite_signer(
    db: AsyncSession,
    proposal: Proposal,
    acceptance: ProposalAcceptance,
    agency: Agency,
    client: AgencyClient,
    actor: User,
) -> None:
    from binx_api.modules.client_portal import service as portal_service

    if acceptance.invited_email is not None:
        return
    signature = await _signer(db, proposal)
    email = signature.signer_email if signature else proposal.recipient_email
    if not email:
        return
    if await _is_contact(db, client.id, email):
        acceptance.invited_email = email  # nothing to send: they're already in
        await db.commit()
        return

    _invitation, raw_token = await portal_service.create_client_invitation(
        db, agency, client, email=email, invited_by=actor
    )
    acceptance.invited_email = email
    signing.record_event(
        db, proposal.id, EVENT_PORTAL_INVITED, actor_label="Binx", detail=f"Invited {email} to the client portal"
    )
    await db.commit()

    deposit = deposit_cents(proposal)
    await email_service.send_proposal_accepted_email(
        to=email,
        agency_name=agency.name,
        title=proposal.title,
        accept_url=email_service.build_portal_invite_accept_url(raw_token),
        deposit_text=_money(deposit, proposal.currency) if deposit else None,
    )


async def _issue_deposit(
    db: AsyncSession,
    proposal: Proposal,
    acceptance: ProposalAcceptance,
    agency: Agency,
    client: AgencyClient,
    actor: User,
) -> None:
    from binx_api.modules.invoicing import service as invoicing_service

    amount = deposit_cents(proposal)
    if amount <= 0 or acceptance.deposit_invoice_id is not None:
        return
    # "30.000" -> "30", "12.500" -> "12.5"
    percent = format(Decimal(proposal.deposit_percent).normalize(), "f")
    try:
        invoice = await invoicing_service.create_invoice(
            db,
            agency,
            created_by=actor,
            client_id=client.id,
            project_id=None,
            issue_date=None,
            due_date=None,
            discount_amount_cents=None,
            discount_percent=None,
            tax_rate_percent=Decimal("0"),
            notes=f"Deposit for the signed proposal “{proposal.title}”.",
            payment_instructions=None,
            line_items=[
                LineItemInput(
                    description=f"Deposit ({percent}%) for “{proposal.title}”"[:1024],
                    quantity=Decimal("1"),
                    unit_price_cents=amount,
                )
            ],
        )
        invoice = await invoicing_service.issue_invoice(db, invoice, issued_by=actor)
    except HTTPException as exc:
        raise AcceptanceBlocked(f"Couldn't issue the deposit invoice: {_http_reason(exc)}") from None
    acceptance.deposit_invoice_id = invoice.id
    signing.record_event(
        db,
        proposal.id,
        EVENT_DEPOSIT_INVOICED,
        actor_label="Binx",
        detail=f"Deposit invoice {invoice.number} for {_money(invoice.total_cents, invoice.currency)}",
    )
    await db.commit()


async def _deposit_settled(db: AsyncSession, acceptance: ProposalAcceptance) -> bool:
    if acceptance.deposit_invoice_id is None:
        return True
    if acceptance.deposit_paid_at is not None:
        return True
    invoice = await db.get(Invoice, acceptance.deposit_invoice_id)
    return invoice is not None and invoice.status == STATUS_PAID


async def _start_project(
    db: AsyncSession,
    proposal: Proposal,
    acceptance: ProposalAcceptance,
    agency: Agency,
    client: AgencyClient,
    actor: User,
) -> None:
    from binx_api.modules.projects import service as projects_service
    from binx_api.modules.projects.models import STATUS_ACTIVE

    if not proposal.create_project_on_accept or acceptance.project_id is not None:
        return
    try:
        project = await projects_service.create_project(
            db,
            agency,
            created_by=actor,
            client_id=client.id,
            name=proposal.title[:255],
            description=proposal.content,
            status_=STATUS_ACTIVE,
            start_date=datetime.now(UTC).date(),
            due_date=None,
        )
    except HTTPException as exc:
        raise AcceptanceBlocked(f"Couldn't start the project: {_http_reason(exc)}") from None
    acceptance.project_id = project.id
    signing.record_event(db, proposal.id, EVENT_PROJECT_CREATED, actor_label="Binx", detail=f"Project “{project.name}”")
    await db.commit()

    if proposal.kickoff_template_id is not None:
        from binx_api.modules.kickoffs import service as kickoffs_service

        try:
            kickoff = await kickoffs_service.create_kickoff(
                db,
                project,
                created_by=actor,
                title=f"Kickoff: {proposal.title}"[:255],
                intro_message=f"Thanks for signing “{proposal.title}”. A few questions to get started.",
                template_id=proposal.kickoff_template_id,
                questions=[],
            )
        except HTTPException as exc:
            raise AcceptanceBlocked(f"Couldn't create the kickoff: {_http_reason(exc)}") from None
        acceptance.kickoff_id = kickoff.id
        await db.commit()
    await _send_kickoff_if_ready(db, proposal, acceptance, actor)


async def _send_kickoff_if_ready(
    db: AsyncSession, proposal: Proposal, acceptance: ProposalAcceptance, actor: User
) -> None:
    """A kickoff goes to the client's portal contact, so it waits until there
    is one (the signer accepting their invitation)."""
    from binx_api.modules.kickoffs import service as kickoffs_service
    from binx_api.modules.kickoffs.models import Kickoff

    if acceptance.kickoff_id is None or acceptance.kickoff_sent_at is not None or acceptance.client_id is None:
        return
    has_contact = (
        await db.scalar(select(ClientContact.id).where(ClientContact.client_id == acceptance.client_id).limit(1))
    ) is not None
    if not has_contact:
        return
    kickoff = await db.get(Kickoff, acceptance.kickoff_id)
    if kickoff is None:
        return
    try:
        await kickoffs_service.send_kickoff(db, kickoff, sent_by=actor)
    except HTTPException as exc:
        raise AcceptanceBlocked(f"Couldn't send the kickoff: {_http_reason(exc)}") from None
    acceptance.kickoff_sent_at = datetime.now(UTC)
    signing.record_event(db, proposal.id, EVENT_KICKOFF_SENT, actor_label="Binx", detail=kickoff.title)
    await db.commit()


async def _start_retainer(
    db: AsyncSession,
    proposal: Proposal,
    acceptance: ProposalAcceptance,
    agency: Agency,
    client: AgencyClient,
    actor: User,
) -> None:
    """Bills the monthly lines every month, starting today, on today's day of
    the month (the 29th to 31st become the 28th, as for any schedule)."""
    from binx_api.modules.invoicing import recurring_service

    if proposal.monthly_total_cents <= 0 or acceptance.retainer_schedule_id is not None:
        return
    # Only the monthly lines in the deal (the chosen package, ticked add-ons).
    lines = [line for line in await options.list_included_lines(db, proposal.id) if line.billing == BILLING_MONTHLY]
    today = datetime.now(UTC).date()
    try:
        schedule = await recurring_service.create_schedule(
            db,
            agency,
            created_by=actor,
            client_id=client.id,
            project_id=acceptance.project_id,
            title=f"Retainer: {proposal.title}"[:255],
            interval="monthly",
            interval_count=1,
            day_of_month=min(today.day, 28),
            weekday=None,
            due_days=14,
            tax_rate_percent=proposal.tax_rate_percent,
            notes=f"Monthly services from the signed proposal “{proposal.title}”."[:4096],
            payment_instructions=None,
            auto_issue=True,
            start_date=today,
            line_items=[
                RecurringLineItemInput(
                    description=line.description,
                    quantity=line.quantity,
                    unit_price_cents=line.unit_price_cents,
                    service_id=line.service_id,
                )
                for line in lines
            ],
        )
    except HTTPException as exc:
        raise AcceptanceBlocked(f"Couldn't start the monthly billing: {_http_reason(exc)}") from None
    acceptance.retainer_schedule_id = schedule.id
    signing.record_event(
        db,
        proposal.id,
        EVENT_RETAINER_SCHEDULED,
        actor_label="Binx",
        detail=(
            f"Monthly billing of {_money(proposal.monthly_total_cents, proposal.currency)} a month, "
            f"from {today:%B} {today.day}, {today.year}"
        ),
    )
    await db.commit()


# ---- Running it ------------------------------------------------------------------


async def _run(db: AsyncSession, proposal: Proposal, acceptance: ProposalAcceptance) -> None:
    agency = await db.get(Agency, proposal.agency_id)
    assert agency is not None
    actor = await _actor(db, proposal)
    client = await _ensure_client(db, proposal, acceptance, agency, actor)
    await _invite_signer(db, proposal, acceptance, agency, client, actor)
    await _issue_deposit(db, proposal, acceptance, agency, client, actor)
    if not await _deposit_settled(db, acceptance):
        acceptance.status = ACCEPTANCE_AWAITING_DEPOSIT
        acceptance.blocked_reason = None
        await db.commit()
        return
    await _start_project(db, proposal, acceptance, agency, client, actor)
    await _start_retainer(db, proposal, acceptance, agency, client, actor)
    acceptance.status = ACCEPTANCE_DONE
    acceptance.blocked_reason = None
    acceptance.completed_at = acceptance.completed_at or datetime.now(UTC)
    await db.commit()


async def _discard_pending(db: AsyncSession) -> None:
    """Rolls back only when the failed step left changes behind. A rollback
    expires every object in the session, including the caller's (the
    request's proposal, user, agency), so it's avoided when there's nothing
    to undo, which is the usual case: refusals like a plan limit are raised
    before anything is added."""
    if db.new or db.dirty or db.deleted:
        await db.rollback()


async def _run_safely(db: AsyncSession, proposal: Proposal, acceptance: ProposalAcceptance) -> ProposalAcceptance:
    proposal_id, acceptance_id = proposal.id, acceptance.id
    try:
        await _run(db, proposal, acceptance)
    except AcceptanceBlocked as blocked:
        await _discard_pending(db)
        await _block(db, proposal_id, acceptance_id, str(blocked))
    except Exception as exc:  # noqa: BLE001 - reported; the signature is already safe
        await db.rollback()
        await capture_error(exc, tags={"job": "proposal_acceptance"}, context={"proposal_id": str(proposal_id)})
        await _block(db, proposal_id, acceptance_id, "Something went wrong setting this client up. Try again.")
    refreshed = await db.get(ProposalAcceptance, acceptance_id, populate_existing=True)
    assert refreshed is not None
    return refreshed


async def _block(db: AsyncSession, proposal_id: uuid.UUID, acceptance_id: uuid.UUID, reason: str) -> None:
    acceptance = await db.get(ProposalAcceptance, acceptance_id, populate_existing=True)
    proposal = await db.get(Proposal, proposal_id, populate_existing=True)
    if acceptance is None or proposal is None:
        return
    acceptance.status = ACCEPTANCE_BLOCKED
    acceptance.blocked_reason = reason[:1024]
    signing.record_event(db, proposal.id, EVENT_ACCEPTANCE_BLOCKED, actor_label="Binx", detail=reason)
    await db.commit()
    if proposal.created_by_id is not None:
        await notifications_service.notify(
            db,
            user_id=proposal.created_by_id,
            category=NOTIFY_CATEGORY_PROPOSALS,
            event_type="proposal_acceptance_blocked",
            title=f"Setting up “{proposal.title}” needs you",
            body=reason,
            link=f"/proposals/{proposal.id}",
            agency_id=proposal.agency_id,
        )


async def accept(db: AsyncSession, proposal: Proposal) -> ProposalAcceptance | None:
    """Runs (or resumes) acceptance for a completed proposal. None when the
    proposal isn't complete, or is for neither a lead nor a client. Safe to
    call more than once."""
    if proposal.completed_at is None:
        return None
    if proposal.lead_id is None and proposal.client_id is None:
        # A standalone proposal: no one to set up, so nothing to accept into.
        return None
    acceptance = await get_acceptance(db, proposal.id)
    if acceptance is None:
        acceptance = ProposalAcceptance(proposal_id=proposal.id, status=ACCEPTANCE_IN_PROGRESS)
        db.add(acceptance)
        await db.commit()
        await db.refresh(acceptance)
    elif acceptance.status == ACCEPTANCE_DONE:
        return acceptance
    return await _run_safely(db, proposal, acceptance)


# ---- Hooks from elsewhere ---------------------------------------------------------


async def on_invoice_paid(db: AsyncSession, invoice: Invoice) -> None:
    """Called once an invoice is fully paid: a proposal's deposit landing
    starts the work it was waiting on."""
    acceptance = await db.scalar(select(ProposalAcceptance).where(ProposalAcceptance.deposit_invoice_id == invoice.id))
    if acceptance is None or acceptance.deposit_paid_at is not None:
        return
    proposal = await db.get(Proposal, acceptance.proposal_id)
    if proposal is None:
        return
    acceptance.deposit_paid_at = datetime.now(UTC)
    signing.record_event(
        db,
        proposal.id,
        EVENT_DEPOSIT_PAID,
        actor_label="Binx",
        detail=f"Deposit invoice {invoice.number} paid",
    )
    await db.commit()
    await _run_safely(db, proposal, acceptance)


async def on_contact_joined(db: AsyncSession, client_id: uuid.UUID) -> None:
    """Called when someone joins a client's portal: sends any accepted
    proposal's kickoff that was waiting for a contact."""
    rows = (
        await db.execute(
            select(ProposalAcceptance).where(
                ProposalAcceptance.client_id == client_id,
                ProposalAcceptance.kickoff_id.is_not(None),
                ProposalAcceptance.kickoff_sent_at.is_(None),
            )
        )
    ).scalars()
    for acceptance in list(rows):
        proposal = await db.get(Proposal, acceptance.proposal_id)
        if proposal is None:
            continue
        try:
            actor = await _actor(db, proposal)
            await _send_kickoff_if_ready(db, proposal, acceptance, actor)
        except AcceptanceBlocked as blocked:
            await _discard_pending(db)
            await _block(db, proposal.id, acceptance.id, str(blocked))
        except Exception as exc:  # noqa: BLE001 - reported; joining the portal must not fail
            await db.rollback()
            await capture_error(exc, tags={"job": "proposal_acceptance"}, context={"client_id": str(client_id)})

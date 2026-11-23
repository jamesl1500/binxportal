"""The 30-day hold on a deleted agency.

Deleting an agency doesn't erase it. It goes on hold: teammates, client
portals, public links and invitations stop working at once, its paid plan
stops renewing, and an owner can still restore it or export its data. When
the hold ends, a background job erases the agency and its uploaded files.

The Privacy Policy and Terms promise this schedule, so a change here needs a
matching change there.

Access is enforced where each path looks an agency up:
``require_agency_role`` for staff routes (its ``during_hold`` argument opens
the few an owner still needs), ``get_portal_memberships`` for the portal, and
the invitation, subdomain and public-proposal lookups.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

import stripe
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from binx_api.core import storage, stripe_client
from binx_api.core.config import get_settings
from binx_api.core.database import async_session_factory
from binx_api.core.errors import capture_error
from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import CATEGORY_TEAM, VISIBILITY_ADMIN
from binx_api.modules.agencies.models import ROLE_OWNER, Agency, AgencyClient, AgencyMember
from binx_api.modules.billing import service as billing_service
from binx_api.modules.billing.models import AgencySubscription
from binx_api.modules.messaging.models import Conversation
from binx_api.modules.projects.models import Project
from binx_api.modules.users.models import User

log = logging.getLogger("binx_api.agency_deletion")
settings = get_settings()

DELETION_HOLD_DAYS = 30
PURGE_EVERY_SECONDS = 60 * 60
# Lets the app finish starting before the first run.
PURGE_FIRST_DELAY_SECONDS = 60

_BILLING_ERROR = "We couldn't stop this agency's subscription, so nothing was deleted. Please try again."
_ENDED_STATUSES = ("canceled", "incomplete_expired")


async def _lock_agency(db: AsyncSession, agency_id: uuid.UUID) -> Agency | None:
    """Locks the row, so a restore and the purge can't both act on it."""
    result = await db.execute(
        select(Agency).where(Agency.id == agency_id).with_for_update().execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def _live_subscription(db: AsyncSession, agency_id: uuid.UUID) -> AgencySubscription | None:
    subscription = await db.scalar(select(AgencySubscription).where(AgencySubscription.agency_id == agency_id))
    if subscription is None or not subscription.stripe_subscription_id or subscription.status == "canceled":
        return None
    return subscription


async def _has_already_ended(exc: stripe.StripeError, subscription_id: str) -> bool:
    """Whether Stripe refused a change because the subscription no longer
    exists or has ended. Any other refusal counts as a failure, so a bad
    request can never be mistaken for "billing has stopped"."""
    if not isinstance(exc, stripe.InvalidRequestError):
        return False
    if exc.code == "resource_missing":
        return True
    try:
        live = await stripe_client.retrieve_subscription(subscription_id)
    except stripe.StripeError:
        return False
    return live.status in _ENDED_STATUSES


async def _stop_renewal(db: AsyncSession, agency_id: uuid.UUID) -> bool:
    """Stops a paid plan renewing during the hold. The plan runs to the end of
    the period it's already paid for, so a restore loses nothing. Returns
    whether this call is what stopped it, so a restore undoes only that and
    leaves alone a cancellation the customer chose themselves."""
    subscription = await _live_subscription(db, agency_id)
    if subscription is None or subscription.cancel_at_period_end:
        return False
    if not settings.stripe_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, _BILLING_ERROR)
    subscription_id = subscription.stripe_subscription_id
    assert subscription_id is not None
    try:
        await stripe_client.set_subscription_cancel_at_period_end(subscription_id, cancel=True)
    except stripe.StripeError as exc:
        if await _has_already_ended(exc, subscription_id):
            return False
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, _BILLING_ERROR) from exc
    subscription.cancel_at_period_end = True
    return True


async def _resume_renewal(db: AsyncSession, agency_id: uuid.UUID) -> None:
    subscription = await _live_subscription(db, agency_id)
    if subscription is None:
        return  # It ended during the hold; the agency comes back on Free.
    if not settings.stripe_secret_key:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Billing is unavailable. Please try again.")
    subscription_id = subscription.stripe_subscription_id
    assert subscription_id is not None
    try:
        await stripe_client.set_subscription_cancel_at_period_end(subscription_id, cancel=False)
    except stripe.StripeError as exc:
        if await _has_already_ended(exc, subscription_id):
            return
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "We couldn't turn this agency's subscription back on, so it wasn't restored. Please try again.",
        ) from exc
    subscription.cancel_at_period_end = False


def _start_hold(agency: Agency, *, requested_by_id: uuid.UUID | None, stopped_renewal: bool, now: datetime) -> None:
    agency.deletion_requested_at = now
    agency.deletion_scheduled_for = now + timedelta(days=DELETION_HOLD_DAYS)
    agency.deletion_requested_by_user_id = requested_by_id
    agency.deletion_stopped_renewal = stopped_renewal


def _clear_hold(agency: Agency) -> None:
    agency.deletion_requested_at = None
    agency.deletion_scheduled_for = None
    agency.deletion_requested_by_user_id = None
    agency.deletion_stopped_renewal = False


async def schedule_agency_deletion(db: AsyncSession, agency_id: uuid.UUID, *, requested_by: User) -> Agency:
    """Puts an agency on hold. If its paid plan can't be stopped, nothing
    changes, so nobody is billed for an agency they believe is deleted."""
    agency = await _lock_agency(db, agency_id)
    if agency is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agency not found")
    if agency.deletion_scheduled_for is not None:
        await db.commit()
        return agency
    try:
        stopped = await _stop_renewal(db, agency.id)
    except HTTPException:
        await db.rollback()
        raise
    _start_hold(agency, requested_by_id=requested_by.id, stopped_renewal=stopped, now=datetime.now(UTC))
    await db.commit()

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_TEAM,
        event_type="agency_deletion_scheduled",
        summary=f"{requested_by.full_name} scheduled {agency.name} for deletion",
        visibility=VISIBILITY_ADMIN,
        actor=requested_by,
    )
    return agency


async def _check_restore_fits_plan(db: AsyncSession, agency: Agency, owner: User) -> None:
    limit = await billing_service.max_owned_agencies_for(db, owner, including=agency.id)
    if limit is None:
        return
    active = await db.scalar(
        select(func.count())
        .select_from(AgencyMember)
        .join(Agency, Agency.id == AgencyMember.agency_id)
        .where(
            AgencyMember.user_id == owner.id,
            AgencyMember.role == ROLE_OWNER,
            Agency.deletion_scheduled_for.is_(None),
        )
    )
    if int(active or 0) >= limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"Your plan allows {limit} owned {'agency' if limit == 1 else 'agencies'}, and you're at that limit. "
            f"Upgrade or delete another agency to restore {agency.name}.",
        )


async def restore_agency(
    db: AsyncSession,
    agency_id: uuid.UUID,
    *,
    actor: User,
    enforce_plan_limit: bool = True,
    new_owner: User | None = None,
) -> Agency:
    """Ends a hold. ``new_owner`` is for support restoring an agency whose
    only owner deleted their account; everyone else restores their own."""
    agency = await _lock_agency(db, agency_id)
    if agency is None or agency.deletion_scheduled_for is None:
        await db.rollback()
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This agency isn't scheduled for deletion")
    try:
        if enforce_plan_limit:
            await _check_restore_fits_plan(db, agency, actor)
        if agency.deletion_stopped_renewal:
            await _resume_renewal(db, agency.id)
    except HTTPException:
        await db.rollback()
        raise

    if new_owner is not None:
        membership = await db.scalar(
            select(AgencyMember).where(AgencyMember.agency_id == agency.id, AgencyMember.user_id == new_owner.id)
        )
        if membership is None:
            db.add(AgencyMember(agency_id=agency.id, user_id=new_owner.id, role=ROLE_OWNER))
        else:
            membership.role = ROLE_OWNER
    _clear_hold(agency)
    await db.commit()

    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_TEAM,
        event_type="agency_restored",
        summary=f"{actor.full_name} restored {agency.name}",
        visibility=VISIBILITY_ADMIN,
        actor=actor,
    )
    return agency


async def list_held_agencies_for_owner(db: AsyncSession, user: User) -> list[Agency]:
    result = await db.scalars(
        select(Agency)
        .join(AgencyMember, AgencyMember.agency_id == Agency.id)
        .where(
            AgencyMember.user_id == user.id,
            AgencyMember.role == ROLE_OWNER,
            Agency.deletion_scheduled_for.is_not(None),
        )
        .order_by(Agency.deletion_scheduled_for)
    )
    return list(result)


async def hold_sole_owned_agencies(db: AsyncSession, user: User) -> list[Agency]:
    """For account deletion: holds every agency that would be left with no
    owner. Leaves the changes uncommitted, so they land together with the
    account's removal. If a plan can't be stopped, undoes the ones already
    stopped and raises, leaving the account and its agencies as they were."""
    other = aliased(AgencyMember)
    co_owner = (
        select(other.id)
        .where(other.agency_id == Agency.id, other.role == ROLE_OWNER, other.user_id != user.id)
        .exists()
    )
    ids = list(
        await db.scalars(
            select(Agency.id)
            .join(AgencyMember, AgencyMember.agency_id == Agency.id)
            .where(
                AgencyMember.user_id == user.id,
                AgencyMember.role == ROLE_OWNER,
                Agency.deletion_scheduled_for.is_(None),
                ~co_owner,
            )
            .order_by(Agency.id)
        )
    )
    now = datetime.now(UTC)
    held: list[Agency] = []
    try:
        for agency_id in ids:
            agency = await _lock_agency(db, agency_id)
            if agency is None or agency.deletion_scheduled_for is not None:
                continue
            stopped = await _stop_renewal(db, agency.id)
            # The requester's account is about to go, so no reference to it.
            _start_hold(agency, requested_by_id=None, stopped_renewal=stopped, now=now)
            held.append(agency)
    except HTTPException:
        for agency in held:
            if agency.deletion_stopped_renewal:
                try:
                    await _resume_renewal(db, agency.id)
                except HTTPException:
                    log.exception("Couldn't turn renewal back on for agency %s", agency.id)
        await db.rollback()
        raise
    return held


# ---- Erasing agencies whose hold has ended ----------------------------------


async def _cancel_for_purge(db: AsyncSession, agency_id: uuid.UUID) -> bool:
    """Ends any subscription still attached. False means Stripe couldn't
    confirm it, so the agency stays until the next run: erasing it would lose
    the only record of a subscription that may still be billing."""
    subscription = await _live_subscription(db, agency_id)
    if subscription is None:
        return True
    if not settings.stripe_secret_key:
        return False
    subscription_id = subscription.stripe_subscription_id
    assert subscription_id is not None
    try:
        await stripe_client.cancel_subscription(subscription_id)
    except stripe.StripeError as exc:
        if await _has_already_ended(exc, subscription_id):
            return True
        await capture_error(exc, level="warning", tags={"upstream": "stripe"}, context={"agency_id": str(agency_id)})
        return False
    return True


async def _erase_files(
    agency_id: uuid.UUID,
    project_ids: list[uuid.UUID],
    conversation_ids: list[uuid.UUID],
    client_ids: list[uuid.UUID],
) -> None:
    await storage.delete_prefix("agencies", str(agency_id))
    for client_id in client_ids:
        await storage.delete_prefix("agencies", f"clients/{client_id}")
    for project_id in project_ids:
        await storage.delete_prefix("projects", str(project_id))
    for conversation_id in conversation_ids:
        await storage.delete_prefix("messages", str(conversation_id))


async def purge_next_due(db: AsyncSession, *, now: datetime, skip: set[uuid.UUID]) -> tuple[uuid.UUID | None, bool]:
    """Erases the next agency whose hold has ended. Returns its id and whether
    it was erased, or ``(None, False)`` when none are due. SKIP LOCKED lets
    several API processes run this at once without doubling up."""
    query = select(Agency).where(Agency.deletion_scheduled_for <= now)
    if skip:
        query = query.where(Agency.id.not_in(skip))
    agency = await db.scalar(
        query.order_by(Agency.deletion_scheduled_for)
        .limit(1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)
    )
    if agency is None:
        await db.rollback()
        return None, False

    agency_id = agency.id
    if not await _cancel_for_purge(db, agency_id):
        await db.rollback()
        return agency_id, False

    project_ids = list(await db.scalars(select(Project.id).where(Project.agency_id == agency_id)))
    conversation_ids = list(await db.scalars(select(Conversation.id).where(Conversation.agency_id == agency_id)))
    client_ids = list(await db.scalars(select(AgencyClient.id).where(AgencyClient.agency_id == agency_id)))

    # Related rows go through each table's ON DELETE CASCADE. Files come
    # after the commit, so a failed delete can never leave rows without them.
    await db.delete(agency)
    await db.commit()
    await _erase_files(agency_id, project_ids, conversation_ids, client_ids)
    return agency_id, True


async def purge_due_agencies() -> int:
    """Erases every agency whose hold has ended, each in its own transaction,
    so one failure can't block the rest. Returns how many were erased."""
    now = datetime.now(UTC)
    purged = 0
    skip: set[uuid.UUID] = set()
    while True:
        async with async_session_factory() as db:
            try:
                agency_id, erased = await purge_next_due(db, now=now, skip=skip)
            except Exception as exc:  # noqa: BLE001 - reported, and the next run retries
                await db.rollback()
                await capture_error(exc, tags={"job": "agency_purge"})
                return purged
        if agency_id is None:
            return purged
        if erased:
            purged += 1
            log.info("Erased agency %s after its deletion hold", agency_id)
        else:
            skip.add(agency_id)


async def run_purge_loop() -> None:
    """Runs for the life of the API process, started from main.py's lifespan."""
    await asyncio.sleep(PURGE_FIRST_DELAY_SECONDS)
    while True:
        try:
            await purge_due_agencies()
        except Exception as exc:  # noqa: BLE001 - the loop has to outlive any one failure
            await capture_error(exc, tags={"job": "agency_purge"})
        await asyncio.sleep(PURGE_EVERY_SECONDS)

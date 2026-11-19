"""Platform-wide numbers for the Binx team's admin home (``/admin``).

Read-only aggregates across every agency — counts, plan mix, an MRR estimate,
weekly signups and the newest agencies. Platform admins only (see router.py);
nothing here is scoped to the caller's own agency.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.agencies.models import ROLE_OWNER, Agency, AgencyClient, AgencyMember
from binx_api.modules.billing.models import DEFAULT_PLAN, PLAN_FREE, PLAN_ORDER, AgencySubscription, plan_limits
from binx_api.modules.client_portal.models import ClientContact
from binx_api.modules.projects.models import (
    STATUS_ACTIVE,
    STATUS_ON_HOLD,
    STATUS_PLANNING,
    STATUS_WAITING_ON_CLIENT,
    Project,
)
from binx_api.modules.users.models import User

# Everything short of completed/archived — what an agency is still working on.
ACTIVE_PROJECT_STATUSES = (STATUS_PLANNING, STATUS_ACTIVE, STATUS_ON_HOLD, STATUS_WAITING_ON_CLIENT)
# A Stripe subscription in one of these is being paid for (past_due is still
# owed and retried, so it stays in the MRR estimate).
PAYING_STATUSES = ("active", "past_due")
WEEKS_OF_SIGNUPS = 8
RECENT_AGENCIES = 6


def _now() -> datetime:
    return datetime.now(UTC)


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _trial_live(sub: AgencySubscription | None, now: datetime) -> bool:
    return bool(sub and sub.trial_plan and sub.trial_ends_at and sub.trial_ends_at > now)


def _effective_plan(sub: AgencySubscription | None, now: datetime) -> str:
    if sub is None:
        return DEFAULT_PLAN
    if _trial_live(sub, now):
        return sub.trial_plan or DEFAULT_PLAN
    return sub.plan or DEFAULT_PLAN


def _is_paying(sub: AgencySubscription | None, now: datetime) -> bool:
    return bool(
        sub
        and sub.stripe_subscription_id
        and sub.status in PAYING_STATUSES
        and sub.plan != PLAN_FREE
        and not _trial_live(sub, now)
    )


async def _count(db: AsyncSession, statement) -> int:
    return int(await db.scalar(statement) or 0)


async def _weekly(db: AsyncSession, column, since: datetime) -> dict[date, int]:
    week = func.date_trunc("week", column)
    rows = await db.execute(select(week, func.count()).where(column >= since).group_by(week))
    return {bucket.date(): int(count) for bucket, count in rows.all()}


async def platform_overview(db: AsyncSession, *, now: datetime | None = None) -> dict:
    now = now or _now()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    agencies_total = await _count(db, select(func.count(Agency.id)))
    agencies_new_7d = await _count(db, select(func.count(Agency.id)).where(Agency.created_at >= week_ago))
    agencies_new_30d = await _count(db, select(func.count(Agency.id)).where(Agency.created_at >= month_ago))
    users_total = await _count(db, select(func.count(User.id)))
    users_new_7d = await _count(db, select(func.count(User.id)).where(User.created_at >= week_ago))
    staff_users = await _count(db, select(func.count(func.distinct(AgencyMember.user_id))))
    portal_users = await _count(db, select(func.count(func.distinct(ClientContact.user_id))))
    clients_total = await _count(db, select(func.count(AgencyClient.id)))
    projects_active = await _count(
        db, select(func.count(Project.id)).where(Project.status.in_(ACTIVE_PROJECT_STATUSES))
    )

    # Plan mix + revenue. Subscription rows are created lazily, so an agency
    # without one is on the default (Free) plan.
    subs = {sub.agency_id: sub for sub in (await db.execute(select(AgencySubscription))).scalars().all()}
    agency_ids = (await db.execute(select(Agency.id))).scalars().all()
    mix: dict[str, dict[str, int]] = {key: {"agencies": 0, "trialing": 0} for key in PLAN_ORDER}
    paying = mrr = trialing_total = 0
    for agency_id in agency_ids:
        sub = subs.get(agency_id)
        plan = _effective_plan(sub, now)
        row = mix.setdefault(plan, {"agencies": 0, "trialing": 0})
        row["agencies"] += 1
        if _trial_live(sub, now):
            row["trialing"] += 1
            trialing_total += 1
        if sub is not None and _is_paying(sub, now):
            paying += 1
            mrr += plan_limits(sub.plan).price_cents_month

    plan_mix = [
        {"key": key, "name": plan_limits(key).name, **counts}
        for key, counts in sorted(
            mix.items(), key=lambda kv: PLAN_ORDER.index(kv[0]) if kv[0] in PLAN_ORDER else len(PLAN_ORDER)
        )
    ]

    # Weekly signups, oldest first, with empty weeks filled in.
    first_week = _week_start(now.date()) - timedelta(weeks=WEEKS_OF_SIGNUPS - 1)
    since = datetime.combine(first_week, datetime.min.time(), tzinfo=UTC)
    agency_weeks = await _weekly(db, Agency.created_at, since)
    user_weeks = await _weekly(db, User.created_at, since)
    signups_by_week = [
        {
            "week_start": week,
            "agencies": agency_weeks.get(week, 0),
            "users": user_weeks.get(week, 0),
        }
        for week in (first_week + timedelta(weeks=i) for i in range(WEEKS_OF_SIGNUPS))
    ]

    recent_agencies = await _recent_agencies(db, subs, now)

    return {
        "agencies_total": agencies_total,
        "agencies_new_7d": agencies_new_7d,
        "agencies_new_30d": agencies_new_30d,
        "users_total": users_total,
        "users_new_7d": users_new_7d,
        "staff_users": staff_users,
        "portal_users": portal_users,
        "clients_total": clients_total,
        "projects_active": projects_active,
        "paying_agencies": paying,
        "mrr_cents": mrr,
        "trialing_agencies": trialing_total,
        "plan_mix": plan_mix,
        "signups_by_week": signups_by_week,
        "recent_agencies": recent_agencies,
    }


async def _recent_agencies(db: AsyncSession, subs: dict, now: datetime) -> list[dict]:
    members = (
        select(AgencyMember.agency_id, func.count(AgencyMember.id).label("members"))
        .group_by(AgencyMember.agency_id)
        .subquery()
    )
    clients = (
        select(AgencyClient.agency_id, func.count(AgencyClient.id).label("clients"))
        .group_by(AgencyClient.agency_id)
        .subquery()
    )
    rows = await db.execute(
        select(Agency, members.c.members, clients.c.clients)
        .outerjoin(members, members.c.agency_id == Agency.id)
        .outerjoin(clients, clients.c.agency_id == Agency.id)
        .order_by(Agency.created_at.desc().nulls_last(), Agency.name)
        .limit(RECENT_AGENCIES)
    )
    page = rows.all()

    # The founding owner of each (an agency can have several owners).
    owners: dict = {}
    owner_rows = await db.execute(
        select(AgencyMember.agency_id, User.full_name, User.email)
        .join(User, User.id == AgencyMember.user_id)
        .where(AgencyMember.role == ROLE_OWNER, AgencyMember.agency_id.in_([a.id for a, _m, _c in page]))
        .order_by(AgencyMember.created_at)
    )
    for agency_id, full_name, email in owner_rows.all():
        owners.setdefault(agency_id, (full_name, email))

    result = []
    for agency, member_count, client_count in page:
        owner_name, owner_email = owners.get(agency.id, (None, None))
        sub = subs.get(agency.id)
        plan = _effective_plan(sub, now)
        result.append(
            {
                "id": agency.id,
                "name": agency.name,
                "created_at": agency.created_at,
                "plan": plan,
                "plan_name": plan_limits(plan).name,
                "trialing": _trial_live(sub, now),
                "owner_name": owner_name,
                "owner_email": owner_email,
                "members": int(member_count or 0),
                "clients": int(client_count or 0),
            }
        )
    return result

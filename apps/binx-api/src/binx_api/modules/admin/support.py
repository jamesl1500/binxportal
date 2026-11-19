"""Support tooling for the Binx team's admin console.

Search and inspect any agency or user, and the handful of actions customers
actually write in about: "I never got the verification email", "reset my
password", "can I have a few more days on the trial", "someone left — lock
their account". Platform admins only (see router.py).

Every action writes an ``AdminAuditLog`` entry (who did what, to whom), and
anything that touches a customer is also visible to *them*: user actions land
in the person's own security history (activity SCOPE_ACCOUNT), trial changes
in the agency's activity feed (owner/admin visibility). Support work on
someone's account should never be invisible to them.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity import service as activity_service
from binx_api.modules.activity.models import (
    CATEGORY_SETTINGS,
    SCOPE_ACCOUNT,
    SCOPE_AGENCY,
    VISIBILITY_ADMIN,
    ActivityLog,
)
from binx_api.modules.admin.models import (
    ACTION_DEACTIVATED,
    ACTION_MARKED_VERIFIED,
    ACTION_NOTE,
    ACTION_PASSWORD_RESET_SENT,
    ACTION_REACTIVATED,
    ACTION_ROLE_CHANGED,
    ACTION_SIGNED_OUT,
    ACTION_TRIAL_ENDED,
    ACTION_TRIAL_GRANTED,
    ACTION_VERIFICATION_RESENT,
    TARGET_AGENCY,
    TARGET_USER,
    AdminAuditLog,
)
from binx_api.modules.admin.service import ACTIVE_PROJECT_STATUSES
from binx_api.modules.agencies.models import ROLE_OWNER, Agency, AgencyClient, AgencyMember
from binx_api.modules.auth import service as auth_service
from binx_api.modules.auth.models import AuthToken, TokenPurpose
from binx_api.modules.billing.models import (
    DEFAULT_PLAN,
    PLAN_ORDER,
    TRIAL_DISCOUNT_GRACE_DAYS,
    AgencySubscription,
    plan_limits,
)
from binx_api.modules.billing.service import get_or_create_subscription
from binx_api.modules.client_portal.models import ClientContact
from binx_api.modules.feedback.models import FEEDBACK_OPEN_STATUSES, Feedback
from binx_api.modules.projects.models import Project
from binx_api.modules.users.models import ROLE_ADMIN, User

SEARCH_PREVIEW = 5
DETAIL_HISTORY = 15


def _now() -> datetime:
    return datetime.now(UTC)


def _like(q: str) -> str:
    # Escape LIKE wildcards so a search for "100%" means the literal text.
    escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------


async def record(
    db: AsyncSession,
    *,
    actor: User,
    action: str,
    target_type: str,
    target_id: uuid.UUID,
    target_label: str,
    detail: str | None = None,
) -> AdminAuditLog:
    entry = AdminAuditLog(
        actor_id=actor.id,
        actor_name=actor.full_name,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_label=target_label[:255],
        detail=detail,
        created_at=_now(),
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def list_audit(
    db: AsyncSession,
    *,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AdminAuditLog], int]:
    conditions = []
    if target_type:
        conditions.append(AdminAuditLog.target_type == target_type)
    if target_id:
        conditions.append(AdminAuditLog.target_id == target_id)
    total = await db.scalar(select(func.count(AdminAuditLog.id)).where(*conditions)) or 0
    rows = await db.execute(
        select(AdminAuditLog).where(*conditions).order_by(AdminAuditLog.created_at.desc()).limit(limit).offset(offset)
    )
    return list(rows.scalars().all()), int(total)


# ---------------------------------------------------------------------------
# Agencies
# ---------------------------------------------------------------------------


def _trial_live_expr(now: datetime):
    return and_(AgencySubscription.trial_plan.is_not(None), AgencySubscription.trial_ends_at > now)


def _trial_live(sub: AgencySubscription | None, now: datetime) -> bool:
    return bool(sub and sub.trial_plan and sub.trial_ends_at and sub.trial_ends_at > now)


def _effective_plan(sub: AgencySubscription | None, now: datetime) -> str:
    if sub is None:
        return DEFAULT_PLAN
    return (sub.trial_plan if _trial_live(sub, now) else sub.plan) or DEFAULT_PLAN


async def _agency_rows(db: AsyncSession, agencies: list[Agency]) -> list[dict]:
    """List-row shape for a page of agencies: counts, owner, plan."""
    if not agencies:
        return []
    ids = [a.id for a in agencies]
    now = _now()

    async def _counts(statement) -> dict:
        return {key: int(count) for key, count in (await db.execute(statement)).all()}

    members = await _counts(
        select(AgencyMember.agency_id, func.count())
        .where(AgencyMember.agency_id.in_(ids))
        .group_by(AgencyMember.agency_id)
    )
    clients = await _counts(
        select(AgencyClient.agency_id, func.count())
        .where(AgencyClient.agency_id.in_(ids))
        .group_by(AgencyClient.agency_id)
    )
    projects = await _counts(
        select(Project.agency_id, func.count())
        .where(Project.agency_id.in_(ids), Project.status.in_(ACTIVE_PROJECT_STATUSES))
        .group_by(Project.agency_id)
    )
    subs = {
        s.agency_id: s
        for s in (await db.execute(select(AgencySubscription).where(AgencySubscription.agency_id.in_(ids)))).scalars()
    }
    owners: dict = {}
    for agency_id, name, email in (
        await db.execute(
            select(AgencyMember.agency_id, User.full_name, User.email)
            .join(User, User.id == AgencyMember.user_id)
            .where(AgencyMember.agency_id.in_(ids), AgencyMember.role == ROLE_OWNER)
            .order_by(AgencyMember.created_at)
        )
    ).all():
        owners.setdefault(agency_id, (name, email))

    rows = []
    for agency in agencies:
        sub = subs.get(agency.id)
        plan = _effective_plan(sub, now)
        owner_name, owner_email = owners.get(agency.id, (None, None))
        rows.append(
            {
                "id": agency.id,
                "name": agency.name,
                "slug": agency.slug,
                "subdomain": agency.subdomain,
                "created_at": agency.created_at,
                "plan": plan,
                "plan_name": plan_limits(plan).name,
                "trialing": _trial_live(sub, now),
                "subscription_status": sub.status if sub else None,
                "owner_name": owner_name,
                "owner_email": owner_email,
                "members": members.get(agency.id, 0),
                "clients": clients.get(agency.id, 0),
                "active_projects": projects.get(agency.id, 0),
            }
        )
    return rows


async def search_agencies(
    db: AsyncSession,
    *,
    q: str | None = None,
    plan: str | None = None,
    trialing: bool | None = None,
    limit: int = 25,
    offset: int = 0,
) -> tuple[list[dict], int]:
    now = _now()
    conditions = []
    if q and q.strip():
        like = _like(q)
        owner_match = (
            select(AgencyMember.id)
            .join(User, User.id == AgencyMember.user_id)
            .where(
                AgencyMember.agency_id == Agency.id,
                or_(User.email.ilike(like), User.full_name.ilike(like)),
            )
            .exists()
        )
        conditions.append(
            or_(Agency.name.ilike(like), Agency.slug.ilike(like), Agency.subdomain.ilike(like), owner_match)
        )
    if plan:
        effective = case(
            (_trial_live_expr(now), AgencySubscription.trial_plan),
            else_=func.coalesce(AgencySubscription.plan, DEFAULT_PLAN),
        )
        conditions.append(effective == plan)
    if trialing is not None:
        conditions.append(_trial_live_expr(now) if trialing else ~func.coalesce(_trial_live_expr(now), False))

    base = select(Agency).outerjoin(AgencySubscription, AgencySubscription.agency_id == Agency.id).where(*conditions)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    agencies = list(
        (
            await db.execute(
                base.order_by(Agency.created_at.desc().nulls_last(), Agency.name).limit(limit).offset(offset)
            )
        ).scalars()
    )
    return await _agency_rows(db, agencies), int(total)


async def get_agency_or_404(db: AsyncSession, agency_id: uuid.UUID) -> Agency:
    agency = await db.get(Agency, agency_id)
    if agency is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agency not found")
    return agency


def _activity_read(entry: ActivityLog) -> dict:
    return {
        "id": entry.id,
        "category": entry.category,
        "event_type": entry.event_type,
        "summary": entry.summary,
        "actor_name": entry.actor_name,
        "created_at": entry.created_at,
    }


async def agency_detail(db: AsyncSession, agency_id: uuid.UUID) -> dict:
    agency = await get_agency_or_404(db, agency_id)
    now = _now()
    [row] = await _agency_rows(db, [agency])
    sub = await db.scalar(select(AgencySubscription).where(AgencySubscription.agency_id == agency.id))

    team = (
        await db.execute(
            select(AgencyMember, User)
            .join(User, User.id == AgencyMember.user_id)
            .where(AgencyMember.agency_id == agency.id)
            .order_by(AgencyMember.created_at)
        )
    ).all()
    contacts = select(ClientContact.client_id, func.count().label("n")).group_by(ClientContact.client_id).subquery()
    clients = (
        await db.execute(
            select(AgencyClient, contacts.c.n)
            .outerjoin(contacts, contacts.c.client_id == AgencyClient.id)
            .where(AgencyClient.agency_id == agency.id)
            .order_by(AgencyClient.name)
        )
    ).all()
    projects_total = await db.scalar(select(func.count(Project.id)).where(Project.agency_id == agency.id)) or 0
    open_feedback = (
        await db.scalar(
            select(func.count(Feedback.id)).where(
                Feedback.agency_id == agency.id, Feedback.status.in_(FEEDBACK_OPEN_STATUSES)
            )
        )
        or 0
    )
    activity = (
        await db.execute(
            select(ActivityLog)
            .where(ActivityLog.scope == SCOPE_AGENCY, ActivityLog.agency_id == agency.id)
            .order_by(ActivityLog.created_at.desc())
            .limit(DETAIL_HISTORY)
        )
    ).scalars()
    audit, _ = await list_audit(db, target_type=TARGET_AGENCY, target_id=agency.id, limit=DETAIL_HISTORY)

    effective = _effective_plan(sub, now)
    return {
        **row,
        "subscription": {
            "plan": sub.plan if sub else DEFAULT_PLAN,
            "plan_name": plan_limits(sub.plan if sub else DEFAULT_PLAN).name,
            "effective_plan": effective,
            "status": sub.status if sub else "active",
            "trial_plan": sub.trial_plan if sub else None,
            "trial_ends_at": sub.trial_ends_at if sub else None,
            "trialing": _trial_live(sub, now),
            "has_used_trial": bool(sub and sub.has_used_trial),
            "current_period_end": sub.current_period_end if sub else None,
            "cancel_at_period_end": bool(sub and sub.cancel_at_period_end),
            "stripe_customer_id": sub.stripe_customer_id if sub else None,
            "stripe_subscription_id": sub.stripe_subscription_id if sub else None,
        },
        "team": [
            {
                "user_id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "role": member.role,
                "title": member.title,
                "is_active": user.is_active,
                "joined_at": member.created_at,
            }
            for member, user in team
        ],
        "client_list": [
            {"id": c.id, "name": c.name, "portal_contacts": int(n or 0), "created_at": c.created_at} for c, n in clients
        ],
        "projects_total": int(projects_total),
        "open_feedback": int(open_feedback),
        "activity": [_activity_read(e) for e in activity],
        "audit": audit,
    }


async def grant_trial(
    db: AsyncSession, agency_id: uuid.UUID, *, plan: str, days: int, reason: str | None, actor: User
) -> str:
    """Starts or extends a card-free trial, overriding the one-trial-per-agency
    rule billing enforces for self-serve. Refuses a trial that would *lower*
    what a paying agency already has (the trial plan's limits would apply)."""
    agency = await get_agency_or_404(db, agency_id)
    sub = await get_or_create_subscription(db, agency.id)
    now = _now()

    paying = bool(sub.stripe_subscription_id and sub.status in ("active", "past_due"))
    if paying and PLAN_ORDER.index(plan) <= PLAN_ORDER.index(sub.plan if sub.plan in PLAN_ORDER else DEFAULT_PLAN):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{agency.name} already pays for {plan_limits(sub.plan).name} — a {plan_limits(plan).name} trial "
            "wouldn't give them anything more.",
        )

    ends = now + timedelta(days=days)
    sub.trial_plan = plan
    sub.trial_ends_at = ends
    sub.has_used_trial = True
    sub.trial_discount_expires_at = ends + timedelta(days=TRIAL_DISCOUNT_GRACE_DAYS)
    await db.commit()

    plan_name = plan_limits(plan).name
    detail = f"{plan_name} trial for {days} days (ends {ends:%b} {ends.day}, {ends.year})"
    if reason and reason.strip():
        detail += f" — {reason.strip()}"
    await record(
        db,
        actor=actor,
        action=ACTION_TRIAL_GRANTED,
        target_type=TARGET_AGENCY,
        target_id=agency.id,
        target_label=agency.name,
        detail=detail,
    )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_SETTINGS,
        event_type="trial_granted",
        summary=f"Binx support gave {agency.name} a {days}-day {plan_name} trial",
        visibility=VISIBILITY_ADMIN,
        actor=actor,
    )
    return f"{agency.name} is on a {plan_name} trial for the next {days} days."


async def end_trial(db: AsyncSession, agency_id: uuid.UUID, *, actor: User) -> str:
    agency = await get_agency_or_404(db, agency_id)
    sub = await db.scalar(select(AgencySubscription).where(AgencySubscription.agency_id == agency.id))
    if not _trial_live(sub, _now()):
        raise HTTPException(status.HTTP_409_CONFLICT, "This agency isn't on a trial")
    assert sub is not None
    plan_name = plan_limits(sub.trial_plan or DEFAULT_PLAN).name
    sub.trial_ends_at = _now()
    await db.commit()

    await record(
        db,
        actor=actor,
        action=ACTION_TRIAL_ENDED,
        target_type=TARGET_AGENCY,
        target_id=agency.id,
        target_label=agency.name,
        detail=f"Ended the {plan_name} trial early",
    )
    await activity_service.log_agency_activity(
        db,
        agency.id,
        category=CATEGORY_SETTINGS,
        event_type="trial_ended",
        summary=f"Binx support ended {agency.name}'s {plan_name} trial",
        visibility=VISIBILITY_ADMIN,
        actor=actor,
    )
    return f"{agency.name}'s {plan_name} trial has ended."


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

USER_FILTERS = ("active", "inactive", "unverified", "admin", "staff", "portal")


async def _user_rows(db: AsyncSession, users: list[User]) -> list[dict]:
    if not users:
        return []
    ids = [u.id for u in users]

    async def _counts(statement) -> dict:
        return {key: int(count) for key, count in (await db.execute(statement)).all()}

    agencies = await _counts(
        select(AgencyMember.user_id, func.count()).where(AgencyMember.user_id.in_(ids)).group_by(AgencyMember.user_id)
    )
    portals = await _counts(
        select(ClientContact.user_id, func.count())
        .where(ClientContact.user_id.in_(ids))
        .group_by(ClientContact.user_id)
    )
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "user_name": u.user_name,
            "role": u.role,
            "is_active": u.is_active,
            "is_verified": u.is_verified,
            "created_at": u.created_at,
            "last_login_at": u.last_login_at,
            "agencies": agencies.get(u.id, 0),
            "portals": portals.get(u.id, 0),
        }
        for u in users
    ]


async def search_users(
    db: AsyncSession, *, q: str | None = None, filter_: str | None = None, limit: int = 25, offset: int = 0
) -> tuple[list[dict], int]:
    conditions = []
    if q and q.strip():
        like = _like(q)
        conditions.append(or_(User.full_name.ilike(like), User.email.ilike(like), User.user_name.ilike(like)))
    if filter_ == "active":
        conditions.append(User.is_active.is_(True))
    elif filter_ == "inactive":
        conditions.append(User.is_active.is_(False))
    elif filter_ == "unverified":
        conditions.append(User.is_verified.is_(False))
    elif filter_ == "admin":
        conditions.append(User.role == ROLE_ADMIN)
    elif filter_ == "staff":
        conditions.append(select(AgencyMember.id).where(AgencyMember.user_id == User.id).exists())
    elif filter_ == "portal":
        conditions.append(select(ClientContact.id).where(ClientContact.user_id == User.id).exists())

    total = await db.scalar(select(func.count(User.id)).where(*conditions)) or 0
    users = list(
        (
            await db.execute(
                select(User).where(*conditions).order_by(User.created_at.desc(), User.email).limit(limit).offset(offset)
            )
        ).scalars()
    )
    return await _user_rows(db, users), int(total)


async def get_user_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


async def _active_sessions(db: AsyncSession, user_id: uuid.UUID) -> int:
    return int(
        await db.scalar(
            select(func.count(AuthToken.id)).where(
                AuthToken.user_id == user_id,
                AuthToken.purpose == TokenPurpose.REFRESH,
                AuthToken.used_at.is_(None),
                AuthToken.expires_at > _now(),
            )
        )
        or 0
    )


async def user_detail(db: AsyncSession, user_id: uuid.UUID) -> dict:
    user = await get_user_or_404(db, user_id)
    [row] = await _user_rows(db, [user])
    memberships = (
        await db.execute(
            select(AgencyMember, Agency)
            .join(Agency, Agency.id == AgencyMember.agency_id)
            .where(AgencyMember.user_id == user.id)
            .order_by(Agency.name)
        )
    ).all()
    portals = (
        await db.execute(
            select(Agency, AgencyClient)
            .join(ClientContact, ClientContact.agency_id == Agency.id)
            .join(AgencyClient, AgencyClient.id == ClientContact.client_id)
            .where(ClientContact.user_id == user.id)
            .order_by(Agency.name, AgencyClient.name)
        )
    ).all()
    security = (
        await db.execute(
            select(ActivityLog)
            .where(ActivityLog.scope == SCOPE_ACCOUNT, ActivityLog.subject_user_id == user.id)
            .order_by(ActivityLog.created_at.desc())
            .limit(DETAIL_HISTORY)
        )
    ).scalars()
    feedback = (
        await db.execute(
            select(Feedback).where(Feedback.user_id == user.id).order_by(Feedback.created_at.desc()).limit(5)
        )
    ).scalars()
    audit, _ = await list_audit(db, target_type=TARGET_USER, target_id=user.id, limit=DETAIL_HISTORY)

    return {
        **row,
        "phone_number": user.phone_number,
        "job_title": user.job_title,
        "memberships": [
            {"agency_id": a.id, "agency_name": a.name, "role": m.role, "joined_at": m.created_at}
            for m, a in memberships
        ],
        "portals_list": [
            {"agency_id": a.id, "agency_name": a.name, "client_id": c.id, "client_name": c.name} for a, c in portals
        ],
        "security": [_activity_read(e) for e in security],
        "feedback": [
            {"id": f.id, "kind": f.kind, "status": f.status, "message": f.message, "created_at": f.created_at}
            for f in feedback
        ],
        "audit": audit,
        "active_sessions": await _active_sessions(db, user.id),
    }


async def _revoke_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(delete(AuthToken).where(AuthToken.user_id == user_id, AuthToken.purpose == TokenPurpose.REFRESH))


async def _user_action(
    db: AsyncSession,
    user: User,
    *,
    actor: User,
    action: str,
    detail: str,
    account_summary: str,
) -> None:
    """Audit it, and put it in the person's own security history."""
    await record(
        db,
        actor=actor,
        action=action,
        target_type=TARGET_USER,
        target_id=user.id,
        target_label=user.email,
        detail=detail,
    )
    await activity_service.log_account_activity(
        db, user, event_type=f"support_{action}", summary=account_summary, actor=actor
    )


async def send_password_reset(db: AsyncSession, user_id: uuid.UUID, *, actor: User) -> str:
    user = await get_user_or_404(db, user_id)
    if not user.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Reactivate the account before sending a reset link")
    await auth_service.request_password_reset(db, user.email)
    await _user_action(
        db,
        user,
        actor=actor,
        action=ACTION_PASSWORD_RESET_SENT,
        detail="Sent a password reset link",
        account_summary="Binx support sent you a password reset link",
    )
    return f"Password reset link sent to {user.email}."


async def resend_verification(db: AsyncSession, user_id: uuid.UUID, *, actor: User) -> str:
    user = await get_user_or_404(db, user_id)
    if user.is_verified:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email address is already verified")
    await auth_service.resend_verification(db, user.email)
    await _user_action(
        db,
        user,
        actor=actor,
        action=ACTION_VERIFICATION_RESENT,
        detail="Resent the verification email",
        account_summary="Binx support resent your verification email",
    )
    return f"Verification email resent to {user.email}."


async def mark_verified(db: AsyncSession, user_id: uuid.UUID, *, actor: User) -> str:
    user = await get_user_or_404(db, user_id)
    if user.is_verified:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email address is already verified")
    user.is_verified = True
    await db.commit()
    await _user_action(
        db,
        user,
        actor=actor,
        action=ACTION_MARKED_VERIFIED,
        detail="Marked the email address verified",
        account_summary="Binx support verified your email address",
    )
    return f"{user.email} is now verified and can sign in."


async def sign_out_everywhere(db: AsyncSession, user_id: uuid.UUID, *, actor: User) -> str:
    user = await get_user_or_404(db, user_id)
    sessions = await _active_sessions(db, user.id)
    await _revoke_sessions(db, user.id)
    await db.commit()
    await _user_action(
        db,
        user,
        actor=actor,
        action=ACTION_SIGNED_OUT,
        detail=f"Signed out of every device ({sessions} active session{'s' if sessions != 1 else ''})",
        account_summary="Binx support signed you out on every device",
    )
    return f"{user.full_name} will be signed out everywhere within 30 minutes."


async def set_active(db: AsyncSession, user_id: uuid.UUID, *, active: bool, reason: str | None, actor: User) -> str:
    user = await get_user_or_404(db, user_id)
    if user.id == actor.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't change your own account's status here")
    if user.is_active == active:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This account is already active" if active else "This account is already deactivated",
        )
    user.is_active = active
    if not active:
        # Every API call re-checks is_active, so this locks them out at once;
        # dropping refresh tokens just tidies up the dead sessions.
        await _revoke_sessions(db, user.id)
    await db.commit()

    why = f" — {reason.strip()}" if reason and reason.strip() else ""
    await _user_action(
        db,
        user,
        actor=actor,
        action=ACTION_REACTIVATED if active else ACTION_DEACTIVATED,
        detail=("Reactivated the account" if active else "Deactivated the account") + why,
        account_summary="Binx support reactivated your account" if active else "Binx support deactivated your account",
    )
    return f"{user.full_name}'s account is {'active again' if active else 'deactivated'}."


async def set_role(db: AsyncSession, user_id: uuid.UUID, *, role: str, actor: User) -> str:
    user = await get_user_or_404(db, user_id)
    if user.id == actor.id and role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't remove your own admin access")
    if user.role == role:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{user.full_name} already has that role")
    user.role = role
    await db.commit()
    granted = role == ROLE_ADMIN
    await _user_action(
        db,
        user,
        actor=actor,
        action=ACTION_ROLE_CHANGED,
        detail="Granted Binx admin access" if granted else "Removed Binx admin access",
        account_summary="You were given Binx admin access" if granted else "Your Binx admin access was removed",
    )
    return f"{user.full_name} {'is now a Binx admin' if granted else 'is no longer a Binx admin'}."


async def add_note(
    db: AsyncSession, *, target_type: str, target_id: uuid.UUID, body: str, actor: User
) -> AdminAuditLog:
    """A private support note on an agency or user — only the Binx team sees it."""
    if target_type == TARGET_AGENCY:
        label = (await get_agency_or_404(db, target_id)).name
    else:
        label = (await get_user_or_404(db, target_id)).email
    return await record(
        db,
        actor=actor,
        action=ACTION_NOTE,
        target_type=target_type,
        target_id=target_id,
        target_label=label,
        detail=body.strip(),
    )


async def quick_search(db: AsyncSession, q: str) -> dict:
    agencies, _ = await search_agencies(db, q=q, limit=SEARCH_PREVIEW)
    users, _ = await search_users(db, q=q, limit=SEARCH_PREVIEW)
    return {"agencies": agencies, "users": users}

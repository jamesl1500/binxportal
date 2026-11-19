"""Service layer for product feedback.

Two ways in:

* **Open feedback** — the "Send feedback" dialog available on every app and
  portal page (:func:`submit_feedback`). Bug / idea / praise / other, an
  optional 1–5 rating, and the page it was sent from.
* **The check-in pulse** — a small prompt that asks newer accounts "how's it
  going?" at a couple of account-age milestones (:func:`get_due_pulse`,
  :func:`answer_pulse`, :func:`dismiss_pulse`).

Both land in the same ``feedback`` table, triaged by the Binx team (platform
admins) through ``/admin/feedback``. Following the feed-producer pattern used
elsewhere, the admin alert and the submitter's "we replied" notification are
sent *after* the write commits — a failed notification never loses feedback.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.core import email
from binx_api.core.config import get_settings
from binx_api.modules.agencies.models import Agency, AgencyClient, AgencyMember
from binx_api.modules.client_portal import service as portal_service
from binx_api.modules.feedback.models import (
    FEEDBACK_OPEN_STATUSES,
    KIND_PULSE,
    PULSE_ANSWERED,
    PULSE_DISMISSED,
    PULSE_MILESTONES,
    STATUS_DECLINED,
    STATUS_DONE,
    STATUS_NEW,
    STATUS_PLANNED,
    SURFACE_PORTAL,
    Feedback,
    FeedbackPulsePrompt,
)
from binx_api.modules.feedback.schemas import FeedbackAdminUpdate, FeedbackCreate, FeedbackPulseAnswer
from binx_api.modules.notifications import service as notifications_service
from binx_api.modules.notifications.models import (
    CATEGORY_PRODUCT,
    EVENT_FEEDBACK_RECEIVED,
    EVENT_FEEDBACK_UPDATED,
)
from binx_api.modules.users.models import ROLE_ADMIN, User

settings = get_settings()

# Generous for a person, tight for a script. Counted in the DB (not slowapi's
# per-process memory) so it holds across API workers.
SUBMIT_LIMIT_PER_HOUR = 20

# A pulse answer this low is worth a human looking at even with no comment.
PULSE_ALERT_RATING = 2

KIND_LABELS = {
    "bug": "bug report",
    "idea": "idea",
    "praise": "praise",
    "other": "feedback",
    KIND_PULSE: "check-in",
}

_STATUS_COPY = {
    STATUS_PLANNED: "is on our roadmap",
    STATUS_DONE: "has been addressed",
    STATUS_DECLINED: "was reviewed",
}

_CLOSED_STATUSES = {STATUS_DONE, STATUS_DECLINED}


def _now() -> datetime:
    return datetime.now(UTC)


def _excerpt(text: str, limit: int = 160) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else f"{text[: limit - 1].rstrip()}…"


def history_path(surface: str) -> str:
    """Where the submitter reads their feedback and our replies."""
    return "/portal/feedback" if surface == SURFACE_PORTAL else "/feedback"


# ---------------------------------------------------------------------------
# Submitting
# ---------------------------------------------------------------------------


async def _resolve_context(
    db: AsyncSession, user: User, surface: str, agency_id: uuid.UUID | None
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """The (agency_id, client_id) to file this under, checked against the
    caller's real memberships so nobody can attribute feedback to an agency
    they aren't part of."""
    if surface == SURFACE_PORTAL:
        memberships = await portal_service.get_portal_memberships(db, user)
        if not memberships:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has no client portal access")
        # Same "first membership" rule as require_client_contact.
        agency, client, _contact = memberships[0]
        return agency.id, client.id

    if agency_id is None:
        return None, None
    member = await db.scalar(
        select(AgencyMember.id).where(AgencyMember.agency_id == agency_id, AgencyMember.user_id == user.id)
    )
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agency not found")
    return agency_id, None


async def _check_rate(db: AsyncSession, user: User) -> None:
    recent = await db.scalar(
        select(func.count(Feedback.id)).where(
            Feedback.user_id == user.id,
            Feedback.created_at >= _now() - timedelta(hours=1),
        )
    )
    if (recent or 0) >= SUBMIT_LIMIT_PER_HOUR:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "That's a lot of feedback in one hour. Thank you! Please try again a little later.",
        )


async def submit_feedback(db: AsyncSession, user: User, data: FeedbackCreate) -> Feedback:
    await _check_rate(db, user)
    agency_id, client_id = await _resolve_context(db, user, data.surface, data.agency_id)

    feedback = Feedback(
        user_id=user.id,
        user_name=user.full_name,
        user_email=user.email,
        surface=data.surface,
        agency_id=agency_id,
        client_id=client_id,
        kind=data.kind,
        rating=data.rating,
        message=data.message.strip(),
        page_path=data.page_path,
        user_agent=data.user_agent,
        viewport=data.viewport,
        allow_contact=data.allow_contact,
        status=STATUS_NEW,
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)

    await _alert_binx_team(db, feedback, actor=user)
    return feedback


async def list_my_feedback(db: AsyncSession, user: User, *, limit: int = 50) -> list[Feedback]:
    # A rating-only check-in answer has nothing to show on the history list.
    result = await db.execute(
        select(Feedback)
        .where(Feedback.user_id == user.id, or_(Feedback.kind != KIND_PULSE, Feedback.message != ""))
        .order_by(Feedback.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# The check-in pulse
# ---------------------------------------------------------------------------


def _reached_milestone(user: User, now: datetime) -> str | None:
    created = user.created_at
    if created is None:
        return None
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    age = now - created
    reached = [key for key, days in PULSE_MILESTONES if age >= timedelta(days=days)]
    return reached[-1] if reached else None


async def get_due_pulse(db: AsyncSession, user: User, *, now: datetime | None = None) -> str | None:
    """The milestone to ask about now: the latest one the account has
    reached, if it hasn't already been answered or dismissed."""
    key = _reached_milestone(user, now or _now())
    if key is None:
        return None
    seen = await db.scalar(
        select(FeedbackPulsePrompt.id).where(
            FeedbackPulsePrompt.user_id == user.id, FeedbackPulsePrompt.pulse_key == key
        )
    )
    return None if seen else key


def _check_pulse_key(user: User, key: str) -> None:
    valid = {k for k, _days in PULSE_MILESTONES}
    if key not in valid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown check-in")
    reached = _reached_milestone(user, _now())
    order = [k for k, _days in PULSE_MILESTONES]
    if reached is None or order.index(key) > order.index(reached):
        raise HTTPException(status.HTTP_409_CONFLICT, "This check-in isn't open yet")


async def answer_pulse(db: AsyncSession, user: User, key: str, data: FeedbackPulseAnswer) -> Feedback:
    _check_pulse_key(user, key)
    already = await db.scalar(
        select(FeedbackPulsePrompt.id).where(
            FeedbackPulsePrompt.user_id == user.id, FeedbackPulsePrompt.pulse_key == key
        )
    )
    if already:
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already answered this check-in")

    agency_id, client_id = await _resolve_context(db, user, data.surface, data.agency_id)
    message = data.message.strip()
    # A bare score has nothing to triage, so it files itself as done; a
    # comment goes into the inbox like any other feedback.
    needs_triage = bool(message)
    feedback = Feedback(
        user_id=user.id,
        user_name=user.full_name,
        user_email=user.email,
        surface=data.surface,
        agency_id=agency_id,
        client_id=client_id,
        kind=KIND_PULSE,
        rating=data.rating,
        message=message,
        pulse_key=key,
        page_path=data.page_path,
        user_agent=data.user_agent,
        viewport=data.viewport,
        status=STATUS_NEW if needs_triage else STATUS_DONE,
        resolved_at=None if needs_triage else _now(),
    )
    db.add(feedback)
    await db.flush()
    db.add(FeedbackPulsePrompt(user_id=user.id, pulse_key=key, outcome=PULSE_ANSWERED, feedback_id=feedback.id))
    await db.commit()
    await db.refresh(feedback)

    if needs_triage or data.rating <= PULSE_ALERT_RATING:
        await _alert_binx_team(db, feedback, actor=user)
    return feedback


async def dismiss_pulse(db: AsyncSession, user: User, key: str) -> None:
    """Idempotent — a second dismiss (two tabs) is a no-op, and dismissing
    one that's already answered keeps the answer."""
    _check_pulse_key(user, key)
    await db.execute(
        pg_insert(FeedbackPulsePrompt)
        .values(id=uuid.uuid4(), user_id=user.id, pulse_key=key, outcome=PULSE_DISMISSED)
        .on_conflict_do_nothing(constraint="uq_feedback_pulse_prompts_user_key")
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Binx-team triage
# ---------------------------------------------------------------------------


def _admin_query() -> Select[tuple[Feedback, str | None, str | None]]:
    return (
        select(Feedback, Agency.name, AgencyClient.name)
        .outerjoin(Agency, Agency.id == Feedback.agency_id)
        .outerjoin(AgencyClient, AgencyClient.id == Feedback.client_id)
    )


async def list_feedback(
    db: AsyncSession,
    *,
    status_filter: str | None = None,
    kind: str | None = None,
    surface: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[tuple[Feedback, str | None, str | None]], int]:
    conditions = []
    if status_filter == "open":
        conditions.append(Feedback.status.in_(FEEDBACK_OPEN_STATUSES))
    elif status_filter:
        conditions.append(Feedback.status == status_filter)
    if kind:
        conditions.append(Feedback.kind == kind)
    if surface:
        conditions.append(Feedback.surface == surface)
    if q and q.strip():
        like = f"%{q.strip()}%"
        conditions.append(
            or_(Feedback.message.ilike(like), Feedback.user_name.ilike(like), Feedback.user_email.ilike(like))
        )

    total = await db.scalar(select(func.count(Feedback.id)).where(*conditions)) or 0
    result = await db.execute(
        _admin_query().where(*conditions).order_by(Feedback.created_at.desc()).limit(limit).offset(offset)
    )
    return [(fb, agency_name, client_name) for fb, agency_name, client_name in result.all()], total


async def get_feedback_with_context(
    db: AsyncSession, feedback_id: uuid.UUID
) -> tuple[Feedback, str | None, str | None]:
    row = (await db.execute(_admin_query().where(Feedback.id == feedback_id))).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback not found")
    fb, agency_name, client_name = row
    return fb, agency_name, client_name


async def update_feedback(
    db: AsyncSession, feedback_id: uuid.UUID, data: FeedbackAdminUpdate, *, actor: User
) -> tuple[Feedback, str | None, str | None]:
    feedback, agency_name, client_name = await get_feedback_with_context(db, feedback_id)
    sent = data.model_fields_set
    now = _now()

    status_changed = False
    if "status" in sent and data.status and data.status != feedback.status:
        feedback.status = data.status
        feedback.resolved_at = now if data.status in _CLOSED_STATUSES else None
        status_changed = True

    response_changed = False
    if "response" in sent:
        new_response = (data.response or "").strip() or None
        if new_response != feedback.response:
            feedback.response = new_response
            feedback.responded_at = now if new_response else None
            response_changed = new_response is not None

    if "internal_note" in sent:
        feedback.internal_note = (data.internal_note or "").strip() or None

    await db.commit()
    await db.refresh(feedback)

    if status_changed or response_changed:
        await _tell_submitter(
            db, feedback, status_changed=status_changed, response_changed=response_changed, actor=actor
        )
    return feedback, agency_name, client_name


async def summarize(db: AsyncSession) -> dict:
    async def _grouped(column) -> dict[str, int]:
        rows = await db.execute(select(column, func.count(Feedback.id)).group_by(column))
        return {str(key): int(count) for key, count in rows.all()}

    by_status = await _grouped(Feedback.status)
    by_kind = await _grouped(Feedback.kind)
    by_surface = await _grouped(Feedback.surface)

    since = _now() - timedelta(days=30)
    avg_30d, rated_30d = (
        await db.execute(
            select(func.avg(Feedback.rating), func.count(Feedback.rating)).where(
                Feedback.rating.is_not(None), Feedback.created_at >= since
            )
        )
    ).one()
    pulse_avg = await db.scalar(select(func.avg(Feedback.rating)).where(Feedback.kind == KIND_PULSE))
    outcomes = dict(
        (
            await db.execute(
                select(FeedbackPulsePrompt.outcome, func.count(FeedbackPulsePrompt.id)).group_by(
                    FeedbackPulsePrompt.outcome
                )
            )
        ).all()
    )

    return {
        "by_status": by_status,
        "by_kind": by_kind,
        "by_surface": by_surface,
        "open_total": sum(count for key, count in by_status.items() if key in FEEDBACK_OPEN_STATUSES),
        "avg_rating_30d": round(float(avg_30d), 2) if avg_30d is not None else None,
        "rated_30d": rated_30d or 0,
        "pulse_avg_rating": round(float(pulse_avg), 2) if pulse_avg is not None else None,
        "pulse_answered": outcomes.get(PULSE_ANSWERED, 0),
        "pulse_dismissed": outcomes.get(PULSE_DISMISSED, 0),
    }


# ---------------------------------------------------------------------------
# After-commit fan-out
# ---------------------------------------------------------------------------


async def _alert_binx_team(db: AsyncSession, feedback: Feedback, *, actor: User) -> None:
    label = KIND_LABELS.get(feedback.kind, "feedback")
    rating = f" ({feedback.rating}/5)" if feedback.rating else ""
    title = f"New {label}{rating} from {feedback.user_name}"
    body = _excerpt(feedback.message) if feedback.message else None

    admin_ids = (await db.execute(select(User.id).where(User.role == ROLE_ADMIN, User.is_active.is_(True)))).scalars()
    await notifications_service.notify_many(
        db,
        user_ids=list(admin_ids),
        category=CATEGORY_PRODUCT,
        event_type=EVENT_FEEDBACK_RECEIVED,
        title=title,
        body=body,
        link=f"/admin/feedback/{feedback.id}",
        actor=actor,
    )

    if settings.feedback_inbox_email:
        await email.send_feedback_received_email(
            to=settings.feedback_inbox_email,
            title=title,
            message=feedback.message,
            surface=feedback.surface,
            page_path=feedback.page_path,
            feedback_id=str(feedback.id),
        )


async def _tell_submitter(
    db: AsyncSession, feedback: Feedback, *, status_changed: bool, response_changed: bool, actor: User
) -> None:
    if feedback.user_id is None:
        return
    label = KIND_LABELS.get(feedback.kind, "feedback")
    if response_changed:
        title = f"The Binx team replied to your {label}"
        body = _excerpt(feedback.response or "")
    elif status_changed and feedback.status in _STATUS_COPY:
        title = f"Your {label} {_STATUS_COPY[feedback.status]}"
        body = _excerpt(feedback.message) if feedback.message else None
    else:
        # "in_review" / back to "new" — internal bookkeeping, not news.
        return

    link = history_path(feedback.surface)
    await notifications_service.notify(
        db,
        user_id=feedback.user_id,
        category=CATEGORY_PRODUCT,
        event_type=EVENT_FEEDBACK_UPDATED,
        title=title,
        body=body,
        link=link,
        agency_id=feedback.agency_id,
        actor=actor,
    )

    # Portal contacts have no notification bell, so for anyone who said it's
    # fine to follow up, a written reply goes out by email too.
    if response_changed and feedback.allow_contact and feedback.response:
        await email.send_feedback_reply_email(
            to=feedback.user_email,
            label=label,
            original=feedback.message,
            response=feedback.response,
            path=link,
        )

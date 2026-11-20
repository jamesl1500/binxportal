"""
The timeline's side rail: what's coming up, who to celebrate, recent wins,
and how busy the timeline itself was this week. One request, a fixed handful
of small queries, so the rail never slows the feed down.

Everything here is read-only and already visible to any member elsewhere
(the meetings list, the team page, the activity log), filtered by the same
rules: admin-only activity stays admin-only.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from binx_api.modules.activity.models import SCOPE_AGENCY, VISIBILITY_ADMIN, ActivityLog
from binx_api.modules.agencies.models import Agency, AgencyClient, AgencyMember
from binx_api.modules.meetings.models import MEETING_STATUS_SCHEDULED, Meeting
from binx_api.modules.timeline.models import TimelineComment, TimelinePost, TimelineReaction
from binx_api.modules.timeline.schemas import (
    TimelineCelebration,
    TimelineContributor,
    TimelineHighlightsRead,
    TimelineUpcomingMeeting,
    TimelineWeekStats,
    TimelineWin,
)
from binx_api.modules.timeline.service import author_for, authors_by_id, is_moderator
from binx_api.modules.users.models import User

MEETINGS_AHEAD_DAYS = 7
MEETINGS_LIMIT = 4
NEW_MEMBER_DAYS = 14
# An anniversary shows from a week before until two weeks after, so a Monday
# visit still catches the weekend's.
ANNIVERSARY_BEFORE_DAYS = 7
ANNIVERSARY_AFTER_DAYS = 14
CELEBRATIONS_LIMIT = 5
WINS_DAYS = 14
WINS_LIMIT = 5
TOP_CONTRIBUTORS = 3

# Activity worth cheering: money in, deals signed, clients won, kickoffs done.
WIN_EVENTS = (
    "payment_recorded",
    "invoice_paid_portal",
    "proposal_signed",
    "lead_converted",
    "client_created",
    "kickoff_completed",
)


def _anniversary_in(joined: date, year: int) -> date:
    try:
        return joined.replace(year=year)
    except ValueError:  # joined on Feb 29 and this isn't a leap year
        return date(year, 2, 28)


def nearest_anniversary(joined: date, today: date) -> tuple[date, int] | None:
    """The work anniversary inside the show window, with how many years it
    marks, or None. Around New Year the nearest one can be last year's or
    next year's, so all three are checked."""
    for year in (today.year - 1, today.year, today.year + 1):
        anniversary = _anniversary_in(joined, year)
        years = year - joined.year
        if years >= 1 and -ANNIVERSARY_AFTER_DAYS <= (anniversary - today).days <= ANNIVERSARY_BEFORE_DAYS:
            return anniversary, years
    return None


async def _upcoming_meetings(db: AsyncSession, agency_id: uuid.UUID, now: datetime) -> list[TimelineUpcomingMeeting]:
    rows = (
        await db.execute(
            select(Meeting, AgencyClient.name)
            .join(AgencyClient, AgencyClient.id == Meeting.client_id)
            .where(
                Meeting.agency_id == agency_id,
                Meeting.status == MEETING_STATUS_SCHEDULED,
                Meeting.ends_at >= now,
                Meeting.starts_at < now + timedelta(days=MEETINGS_AHEAD_DAYS),
            )
            .order_by(Meeting.starts_at)
            .limit(MEETINGS_LIMIT)
        )
    ).all()
    return [
        TimelineUpcomingMeeting(
            id=meeting.id,
            title=meeting.title,
            starts_at=meeting.starts_at,
            ends_at=meeting.ends_at,
            client_name=client_name,
        )
        for meeting, client_name in rows
    ]


async def _celebrations(db: AsyncSession, agency_id: uuid.UUID, today: date) -> list[TimelineCelebration]:
    rows = (
        await db.execute(
            select(AgencyMember.user_id, AgencyMember.created_at, User.user_name)
            .join(User, User.id == AgencyMember.user_id)
            .where(AgencyMember.agency_id == agency_id)
        )
    ).all()

    found: list[tuple[str, uuid.UUID, str, date, int | None]] = []
    for user_id, joined_at, user_name in rows:
        if joined_at is None:
            continue
        joined = joined_at.astimezone(UTC).date()
        if 0 <= (today - joined).days <= NEW_MEMBER_DAYS:
            found.append(("joined", user_id, user_name, joined, None))
            continue
        anniversary = nearest_anniversary(joined, today)
        if anniversary is not None:
            found.append(("anniversary", user_id, user_name, anniversary[0], anniversary[1]))

    # Closest to today first, then cap.
    found.sort(key=lambda item: abs((item[3] - today).days))
    found = found[:CELEBRATIONS_LIMIT]
    people = await authors_by_id(db, agency_id, (item[1] for item in found))
    return [
        TimelineCelebration(kind=kind, person=author_for(people, user_id), user_name=user_name, day=day, years=years)
        for kind, user_id, user_name, day, years in found
    ]


async def _wins(db: AsyncSession, agency_id: uuid.UUID, now: datetime, *, viewer_is_admin: bool) -> list[TimelineWin]:
    query = select(ActivityLog).where(
        ActivityLog.scope == SCOPE_AGENCY,
        ActivityLog.agency_id == agency_id,
        ActivityLog.event_type.in_(WIN_EVENTS),
        ActivityLog.created_at >= now - timedelta(days=WINS_DAYS),
    )
    if not viewer_is_admin:
        query = query.where(ActivityLog.visibility != VISIBILITY_ADMIN)
    entries = (await db.execute(query.order_by(ActivityLog.created_at.desc()).limit(WINS_LIMIT))).scalars().all()
    return [
        TimelineWin(
            id=entry.id,
            event_type=entry.event_type,
            summary=entry.summary,
            target_type=entry.target_type,
            target_id=entry.target_id,
            created_at=entry.created_at,
        )
        for entry in entries
    ]


async def _week_stats(db: AsyncSession, agency_id: uuid.UUID, now: datetime) -> TimelineWeekStats:
    since = now - timedelta(days=7)
    post_counts: dict[uuid.UUID | None, int] = dict(
        (
            await db.execute(
                select(TimelinePost.author_id, func.count())
                .where(TimelinePost.agency_id == agency_id, TimelinePost.created_at >= since)
                .group_by(TimelinePost.author_id)
            )
        ).all()
    )
    comment_counts: dict[uuid.UUID | None, int] = dict(
        (
            await db.execute(
                select(TimelineComment.author_id, func.count())
                .join(TimelinePost, TimelinePost.id == TimelineComment.post_id)
                .where(TimelinePost.agency_id == agency_id, TimelineComment.created_at >= since)
                .group_by(TimelineComment.author_id)
            )
        ).all()
    )
    reactions = (
        await db.execute(
            select(func.count())
            .select_from(TimelineReaction)
            .join(TimelinePost, TimelinePost.id == TimelineReaction.post_id)
            .where(TimelinePost.agency_id == agency_id, TimelineReaction.created_at >= since)
        )
    ).scalar_one()

    # Ranked by posts, then comments; former members (author_id NULL) don't rank.
    contributors = {user_id for user_id in (*post_counts, *comment_counts) if user_id is not None}
    ranked = sorted(
        contributors,
        key=lambda user_id: (post_counts.get(user_id, 0), comment_counts.get(user_id, 0)),
        reverse=True,
    )[:TOP_CONTRIBUTORS]
    people = await authors_by_id(db, agency_id, ranked)
    return TimelineWeekStats(
        posts=sum(post_counts.values()),
        comments=sum(comment_counts.values()),
        reactions=reactions,
        top_contributors=[
            TimelineContributor(
                person=author_for(people, user_id),
                posts=post_counts.get(user_id, 0),
                comments=comment_counts.get(user_id, 0),
            )
            for user_id in ranked
        ],
    )


async def read_highlights(db: AsyncSession, agency: Agency, *, role: str) -> TimelineHighlightsRead:
    now = datetime.now(UTC)
    return TimelineHighlightsRead(
        upcoming_meetings=await _upcoming_meetings(db, agency.id, now),
        celebrations=await _celebrations(db, agency.id, now.date()),
        wins=await _wins(db, agency.id, now, viewer_is_admin=is_moderator(role)),
        this_week=await _week_stats(db, agency.id, now),
    )

"""
Integration tests for ``binx_api.modules.meetings.service`` — the
slot-generation algorithm (the one genuinely novel piece of logic in this
feature: recurring-rule expansion, existing-meeting exclusion, the
notice/window boundaries, and DST correctness) and the booking race guard.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from binx_api.modules.meetings import service
from binx_api.modules.meetings.models import CREATED_BY_CLIENT, MEETING_STATUS_CANCELLED
from tests.factories import (
    make_agency,
    make_availability_rule,
    make_client,
    make_meeting,
    make_meeting_settings,
    make_user,
)

pytestmark = pytest.mark.integration


@pytest.fixture
async def ctx(db_session):
    owner = await make_user(db_session, full_name="Owner")
    agency = await make_agency(db_session, owner=owner)
    client = await make_client(db_session, agency=agency)
    return owner, agency, client


class TestGetAvailableSlots:
    async def test_basic_generation(self, db_session, ctx) -> None:
        _owner, agency, _client = ctx
        await make_meeting_settings(db_session, agency=agency, timezone="UTC", slot_minutes=30, booking_notice_hours=0)
        # A rule covering every weekday, 09:00-10:00 UTC — 2 slots/day.
        for weekday in range(7):
            await make_availability_rule(
                db_session, agency=agency, weekday=weekday, start_time=time(9, 0), end_time=time(10, 0)
            )

        today = datetime.now(UTC).date()
        target = today + timedelta(days=7)  # comfortably past any notice window
        slots = await service.get_available_slots(db_session, agency, from_date=target, to_date=target)

        assert len(slots) == 2
        starts_at, ends_at = slots[0]
        assert starts_at.time() == time(9, 0)
        assert ends_at == starts_at + timedelta(minutes=30)
        assert slots[1][0] == starts_at + timedelta(minutes=30)

    async def test_no_rules_means_no_slots(self, db_session, ctx) -> None:
        _owner, agency, _client = ctx
        await make_meeting_settings(db_session, agency=agency)
        today = datetime.now(UTC).date()
        slots = await service.get_available_slots(
            db_session, agency, from_date=today, to_date=today + timedelta(days=3)
        )
        assert slots == []

    async def test_existing_meeting_excludes_its_slot(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency, timezone="UTC", slot_minutes=30, booking_notice_hours=0)
        target = datetime.now(UTC).date() + timedelta(days=7)
        weekday = target.weekday()
        await make_availability_rule(
            db_session, agency=agency, weekday=weekday, start_time=time(9, 0), end_time=time(11, 0)
        )
        # 4 slots total (9:00, 9:30, 10:00, 10:30) — book the second one.
        booked_start = datetime.combine(target, time(9, 30), tzinfo=UTC)
        await make_meeting(db_session, agency=agency, client=client, booked_by=owner, starts_at=booked_start)

        slots = await service.get_available_slots(db_session, agency, from_date=target, to_date=target)
        starts = [s[0] for s in slots]
        assert len(slots) == 3
        assert booked_start not in starts

    async def test_cancelled_meeting_does_not_exclude_its_slot(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency, timezone="UTC", slot_minutes=30, booking_notice_hours=0)
        target = datetime.now(UTC).date() + timedelta(days=7)
        weekday = target.weekday()
        await make_availability_rule(
            db_session, agency=agency, weekday=weekday, start_time=time(9, 0), end_time=time(10, 0)
        )
        booked_start = datetime.combine(target, time(9, 0), tzinfo=UTC)
        meeting = await make_meeting(db_session, agency=agency, client=client, booked_by=owner, starts_at=booked_start)
        meeting.status = MEETING_STATUS_CANCELLED
        await db_session.commit()

        slots = await service.get_available_slots(db_session, agency, from_date=target, to_date=target)
        assert len(slots) == 2
        assert any(s[0] == booked_start for s in slots)

    async def test_fully_booked_day_contributes_no_slots_but_others_unaffected(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency, timezone="UTC", slot_minutes=60, booking_notice_hours=0)
        day1 = datetime.now(UTC).date() + timedelta(days=7)
        day2 = day1 + timedelta(days=1)
        for d in (day1, day2):
            await make_availability_rule(
                db_session, agency=agency, weekday=d.weekday(), start_time=time(9, 0), end_time=time(10, 0)
            )
        await make_meeting(
            db_session,
            agency=agency,
            client=client,
            booked_by=owner,
            starts_at=datetime.combine(day1, time(9, 0), tzinfo=UTC),
        )

        slots = await service.get_available_slots(db_session, agency, from_date=day1, to_date=day2)
        assert [s[0].date() for s in slots] == [day2]

    async def test_two_non_adjacent_rules_same_day_do_not_bleed_together(self, db_session, ctx) -> None:
        _owner, agency, _client = ctx
        await make_meeting_settings(db_session, agency=agency, timezone="UTC", slot_minutes=60, booking_notice_hours=0)
        target = datetime.now(UTC).date() + timedelta(days=7)
        weekday = target.weekday()
        await make_availability_rule(
            db_session, agency=agency, weekday=weekday, start_time=time(9, 0), end_time=time(12, 0)
        )
        await make_availability_rule(
            db_session, agency=agency, weekday=weekday, start_time=time(13, 0), end_time=time(17, 0)
        )

        slots = await service.get_available_slots(db_session, agency, from_date=target, to_date=target)
        starts = sorted(s[0].time() for s in slots)
        assert time(12, 0) not in starts
        assert starts == [time(9, 0), time(10, 0), time(11, 0), time(13, 0), time(14, 0), time(15, 0), time(16, 0)]

    async def test_booking_notice_window_excludes_near_term_slots(self, db_session, ctx) -> None:
        _owner, agency, _client = ctx
        await make_meeting_settings(db_session, agency=agency, timezone="UTC", slot_minutes=30, booking_notice_hours=24)
        now = datetime.now(UTC)
        # Rules covering every weekday, all day, so we don't have to reason
        # about which specific weekday "now" falls on.
        for weekday in range(7):
            await make_availability_rule(
                db_session, agency=agency, weekday=weekday, start_time=time(0, 0), end_time=time(23, 30)
            )

        slots = await service.get_available_slots(
            db_session, agency, from_date=now.date(), to_date=now.date() + timedelta(days=2)
        )
        cutoff = now + timedelta(hours=24)
        # Every returned slot must start at/after the notice cutoff (with a
        # couple of minutes of slack for wall-clock drift during the test run).
        assert all(starts_at >= cutoff - timedelta(minutes=2) for starts_at, _ in slots)
        # And something well past the cutoff must actually be present —
        # otherwise this assertion would trivially pass on an empty list.
        assert any(starts_at >= cutoff + timedelta(hours=1) for starts_at, _ in slots)
        # Nothing well before the cutoff should show up.
        assert not any(starts_at <= cutoff - timedelta(hours=1) for starts_at, _ in slots)

    async def test_booking_window_caps_and_clamps_to_date(self, db_session, ctx) -> None:
        _owner, agency, _client = ctx
        await make_meeting_settings(
            db_session, agency=agency, timezone="UTC", slot_minutes=60, booking_notice_hours=0, booking_window_days=7
        )
        for weekday in range(7):
            await make_availability_rule(
                db_session, agency=agency, weekday=weekday, start_time=time(9, 0), end_time=time(10, 0)
            )
        today = datetime.now(UTC).date()

        # Day 8 (index 7, zero-based) is outside a 7-day window.
        beyond = today + timedelta(days=8)
        slots = await service.get_available_slots(db_session, agency, from_date=beyond, to_date=beyond)
        assert slots == []

        # Asking past the cap gets silently clamped, not rejected — the last
        # in-window day still contributes its slot.
        last_in_window = today + timedelta(days=6)
        slots = await service.get_available_slots(
            db_session, agency, from_date=today, to_date=today + timedelta(days=30)
        )
        assert max(s[0].date() for s in slots) == last_in_window

    async def test_dst_spring_forward_uses_correct_utc_offset_per_slot(self, db_session, ctx) -> None:
        _owner, agency, _client = ctx
        # America/New_York springs forward on 2027-03-14 (2:00 AM -> 3:00 AM).
        # A 9 AM rule doesn't touch the transition itself, but its UTC instant
        # must still shift by an hour across the transition date.
        # booking_window_days is deliberately generous (not just "365 from
        # 2027") — it's measured from whenever this test actually runs, so
        # it must comfortably reach these fixed 2027 dates regardless of the
        # real current date.
        await make_meeting_settings(
            db_session,
            agency=agency,
            timezone="America/New_York",
            slot_minutes=60,
            booking_notice_hours=0,
            booking_window_days=800,
        )
        before, transition_day, after = date(2027, 3, 13), date(2027, 3, 14), date(2027, 3, 15)
        for d in (before, transition_day, after):
            await make_availability_rule(
                db_session, agency=agency, weekday=d.weekday(), start_time=time(9, 0), end_time=time(10, 0)
            )

        slots = await service.get_available_slots(db_session, agency, from_date=before, to_date=after)
        starts_by_local_date = {}
        for starts_at, _ends_at in slots:
            local_date = starts_at.astimezone(ZoneInfo("America/New_York")).date()
            starts_by_local_date[local_date] = starts_at

        # Same "9am local" rule, but its UTC instant shifts by exactly one
        # hour across the transition — this is what actually catches a "one
        # UTC offset computed for the whole day" bug class.
        assert starts_by_local_date[before].hour == 14  # EST: UTC-5 -> 9am local = 14:00 UTC
        assert starts_by_local_date[after].hour == 13  # EDT: UTC-4 -> 9am local = 13:00 UTC

    async def test_dst_fall_back_uses_correct_utc_offset_per_slot(self, db_session, ctx) -> None:
        _owner, agency, _client = ctx
        # America/New_York falls back on 2027-11-07 (2:00 AM -> 1:00 AM).
        await make_meeting_settings(
            db_session,
            agency=agency,
            timezone="America/New_York",
            slot_minutes=60,
            booking_notice_hours=0,
            booking_window_days=800,
        )
        before, after = date(2027, 11, 6), date(2027, 11, 8)
        for d in (before, after):
            await make_availability_rule(
                db_session, agency=agency, weekday=d.weekday(), start_time=time(9, 0), end_time=time(10, 0)
            )

        slots = await service.get_available_slots(db_session, agency, from_date=before, to_date=after)
        starts_by_local_date = {
            starts_at.astimezone(ZoneInfo("America/New_York")).date(): starts_at for starts_at, _ in slots
        }
        assert starts_by_local_date[before].hour == 13  # EDT: UTC-4
        assert starts_by_local_date[after].hour == 14  # EST: UTC-5


class TestBookSlot:
    async def test_books_a_slot_successfully(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency)
        starts_at = datetime.now(UTC) + timedelta(days=1)
        meeting = await make_meeting(db_session, agency=agency, client=client, booked_by=owner, starts_at=starts_at)
        assert meeting.client_id == client.id
        assert meeting.ends_at == meeting.starts_at + timedelta(minutes=30)

    async def test_overlapping_slot_is_rejected(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency)
        starts_at = datetime.now(UTC) + timedelta(days=1)
        await make_meeting(db_session, agency=agency, client=client, booked_by=owner, starts_at=starts_at)

        with pytest.raises(HTTPException) as exc:
            await make_meeting(db_session, agency=agency, client=client, booked_by=owner, starts_at=starts_at)
        assert exc.value.status_code == 409

    async def test_client_booking_inside_notice_window_is_rejected(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency, booking_notice_hours=24)
        soon = datetime.now(UTC) + timedelta(hours=1)

        with pytest.raises(HTTPException) as exc:
            await service.book_slot(
                db_session,
                agency,
                client,
                starts_at=soon,
                project_id=None,
                title="Too soon",
                notes=None,
                location=None,
                booked_by=owner,
                booked_by_kind=CREATED_BY_CLIENT,
                bypass_notice_window=False,
            )
        assert exc.value.status_code == 409

    async def test_staff_booking_bypasses_notice_window(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency, booking_notice_hours=24)
        soon = datetime.now(UTC) + timedelta(minutes=5)
        # make_meeting already passes bypass_notice_window=True (staff kind by default).
        meeting = await make_meeting(db_session, agency=agency, client=client, booked_by=owner, starts_at=soon)
        assert meeting.starts_at == soon


class TestCancelMeeting:
    async def test_cancels_a_scheduled_meeting(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency)
        meeting = await make_meeting(
            db_session, agency=agency, client=client, booked_by=owner, starts_at=datetime.now(UTC) + timedelta(days=1)
        )
        cancelled = await service.cancel_meeting(
            db_session, meeting, agency, client, cancelled_by=owner, cancelled_by_kind="agency_member"
        )
        assert cancelled.status == MEETING_STATUS_CANCELLED
        assert cancelled.cancelled_by_name == owner.full_name

    async def test_cancelling_twice_is_rejected(self, db_session, ctx) -> None:
        owner, agency, client = ctx
        await make_meeting_settings(db_session, agency=agency)
        meeting = await make_meeting(
            db_session, agency=agency, client=client, booked_by=owner, starts_at=datetime.now(UTC) + timedelta(days=1)
        )
        await service.cancel_meeting(
            db_session, meeting, agency, client, cancelled_by=owner, cancelled_by_kind="agency_member"
        )

        with pytest.raises(HTTPException) as exc:
            await service.cancel_meeting(
                db_session, meeting, agency, client, cancelled_by=owner, cancelled_by_kind="agency_member"
            )
        assert exc.value.status_code == 409

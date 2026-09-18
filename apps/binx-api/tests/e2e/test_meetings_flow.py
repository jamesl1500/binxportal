"""
End-to-end tests for meeting scheduling: staff configure availability, a
client books through the portal, staff sees it and is notified, and either
side can cancel — with the permission split, cross-client isolation, and
notification fan-out checked along the way.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from binx_api.modules.agencies.models import ROLE_MEMBER, AgencyMember
from tests.conftest import auth_headers
from tests.factories import make_agency, make_client, make_client_contact, make_user

pytestmark = pytest.mark.e2e

_ALL_WEEK_WIDE_OPEN = [{"weekday": weekday, "start_time": "00:00:00", "end_time": "23:00:00"} for weekday in range(7)]

# Every date in this file is computed relative to "now" rather than
# hardcoded — a hardcoded date is guaranteed to eventually drift into the
# past (and therefore get silently filtered out by the booking-notice
# window) as real time passes.
_TOMORROW = (datetime.now(UTC) + timedelta(days=1)).date()
_WEEK_OUT = _TOMORROW + timedelta(days=7)
_FAR_FUTURE_ISO = (datetime.now(UTC) + timedelta(days=200)).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@pytest.fixture
async def team(db_session):
    owner = await make_user(db_session, full_name="Olivia Owner")
    member = await make_user(db_session, full_name="Mia Member")
    agency = await make_agency(db_session, owner=owner)
    db_session.add(AgencyMember(agency_id=agency.id, user_id=member.id, role=ROLE_MEMBER))
    await db_session.commit()
    client = await make_client(db_session, agency=agency, name="Globex")
    contact_user = await make_user(db_session, full_name="Casey Client")
    await make_client_contact(db_session, agency=agency, client=client, user=contact_user, is_primary=True)
    return agency, client, owner, member, contact_user


async def _open_up_availability(http_client, agency_id, owner, *, self_booking_enabled=True) -> None:
    """Wide-open, no-notice availability so the test can book any near-term slot."""
    settings_resp = await http_client.patch(
        f"/agencies/{agency_id}/meeting-settings",
        json={
            "timezone": "UTC",
            "slot_minutes": 30,
            "booking_notice_hours": 0,
            "booking_window_days": 30,
            "self_booking_enabled": self_booking_enabled,
        },
        headers=auth_headers(owner),
    )
    assert settings_resp.status_code == 200, settings_resp.text
    rules_resp = await http_client.put(
        f"/agencies/{agency_id}/availability-rules", json=_ALL_WEEK_WIDE_OPEN, headers=auth_headers(owner)
    )
    assert rules_resp.status_code == 200, rules_resp.text


class TestAvailabilitySettings:
    async def test_member_reads_owner_writes(self, client, team) -> None:
        agency, _c, owner, member, _contact = team
        base = f"/agencies/{agency.id}/meeting-settings"

        read = await client.get(base, headers=auth_headers(member))
        assert read.status_code == 200
        assert read.json()["timezone"] == "UTC"
        assert read.json()["self_booking_enabled"] is True

        payload = {
            "timezone": "America/New_York",
            "slot_minutes": 45,
            "booking_notice_hours": 12,
            "booking_window_days": 14,
            "self_booking_enabled": False,
        }
        forbidden = await client.patch(base, json=payload, headers=auth_headers(member))
        assert forbidden.status_code == 403

        updated = await client.patch(base, json=payload, headers=auth_headers(owner))
        assert updated.status_code == 200
        assert updated.json()["timezone"] == "America/New_York"
        assert updated.json()["self_booking_enabled"] is False

    async def test_replace_availability_rules_is_a_full_replace(self, client, team) -> None:
        agency, _c, owner, member, _contact = team
        base = f"/agencies/{agency.id}/availability-rules"

        first = await client.put(
            base,
            json=[{"weekday": 0, "start_time": "09:00:00", "end_time": "12:00:00"}],
            headers=auth_headers(owner),
        )
        assert first.status_code == 200
        assert len(first.json()) == 1

        forbidden = await client.put(
            base, json=[{"weekday": 1, "start_time": "09:00:00", "end_time": "10:00:00"}], headers=auth_headers(member)
        )
        assert forbidden.status_code == 403

        replaced = await client.put(
            base,
            json=[
                {"weekday": 1, "start_time": "13:00:00", "end_time": "17:00:00"},
                {"weekday": 3, "start_time": "13:00:00", "end_time": "17:00:00"},
            ],
            headers=auth_headers(owner),
        )
        assert replaced.status_code == 200
        assert len(replaced.json()) == 2  # the old Monday rule is gone, not appended to

        rejected = await client.put(
            base,
            json=[{"weekday": 0, "start_time": "12:00:00", "end_time": "09:00:00"}],  # end before start
            headers=auth_headers(owner),
        )
        assert rejected.status_code == 422


class TestBookingFlow:
    async def test_client_books_staff_sees_it_and_is_notified(self, client, team) -> None:
        agency, _agency_client, owner, member, contact_user = team
        staff_base = f"/agencies/{agency.id}"
        await _open_up_availability(client, agency.id, owner)

        slots_resp = await client.get(
            "/portal/meetings/slots",
            params={"from_date": _TOMORROW.isoformat(), "to_date": _WEEK_OUT.isoformat()},
            headers=auth_headers(contact_user),
        )
        assert slots_resp.status_code == 200
        slots = slots_resp.json()
        assert len(slots) > 0
        chosen = slots[0]["starts_at"]

        booked = await client.post(
            "/portal/meetings", json={"starts_at": chosen, "title": "Kickoff call"}, headers=auth_headers(contact_user)
        )
        assert booked.status_code == 201, booked.text
        meeting = booked.json()
        assert meeting["status"] == "scheduled"
        assert meeting["created_by_kind"] == "client"
        assert meeting["client_name"] == "Globex"

        # Staff sees it on the agency-wide list.
        staff_list = await client.get(f"{staff_base}/meetings", headers=auth_headers(owner))
        assert staff_list.status_code == 200
        assert any(m["id"] == meeting["id"] for m in staff_list.json())

        # The double-booked slot is no longer offered.
        slots_after = await client.get(
            "/portal/meetings/slots",
            params={"from_date": _TOMORROW.isoformat(), "to_date": _WEEK_OUT.isoformat()},
            headers=auth_headers(contact_user),
        )
        assert chosen not in [s["starts_at"] for s in slots_after.json()]

        # Every agency member — owner and member — was notified.
        for staff_user in (owner, member):
            notifications = await client.get("/notifications", headers=auth_headers(staff_user))
            assert notifications.status_code == 200
            items = notifications.json()["items"]
            assert any(n["category"] == "meetings" and n["event_type"] == "meeting_booked" for n in items)

    async def test_self_booking_disabled_blocks_portal_booking(self, client, team) -> None:
        agency, _c, owner, _member, contact_user = team
        await _open_up_availability(client, agency.id, owner, self_booking_enabled=False)

        slots = await client.get(
            "/portal/meetings/slots",
            params={"from_date": _TOMORROW.isoformat(), "to_date": _WEEK_OUT.isoformat()},
            headers=auth_headers(contact_user),
        )
        assert slots.status_code == 200
        assert slots.json() == []

        booked = await client.post(
            "/portal/meetings", json={"starts_at": _FAR_FUTURE_ISO, "title": "Nope"}, headers=auth_headers(contact_user)
        )
        assert booked.status_code == 403

    async def test_staff_schedules_and_client_sees_it(self, client, team) -> None:
        agency, agency_client, owner, _member, contact_user = team

        created = await client.post(
            f"/agencies/{agency.id}/meetings",
            json={"client_id": str(agency_client.id), "starts_at": _FAR_FUTURE_ISO, "title": "Quarterly review"},
            headers=auth_headers(owner),
        )
        assert created.status_code == 201, created.text
        assert created.json()["created_by_kind"] == "agency_member"

        portal_list = await client.get("/portal/meetings", headers=auth_headers(contact_user))
        assert portal_list.status_code == 200
        assert any(m["title"] == "Quarterly review" for m in portal_list.json())

    async def test_cancel_from_either_side(self, client, team) -> None:
        agency, agency_client, owner, _member, contact_user = team
        staff_base = f"/agencies/{agency.id}"

        created = await client.post(
            f"{staff_base}/meetings",
            json={"client_id": str(agency_client.id), "starts_at": _FAR_FUTURE_ISO, "title": "To cancel"},
            headers=auth_headers(owner),
        )
        meeting_id = created.json()["id"]

        cancelled = await client.post(f"{staff_base}/meetings/{meeting_id}/cancel", headers=auth_headers(owner))
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        assert cancelled.json()["cancelled_by_kind"] == "agency_member"

        # Client sees the cancellation reflected too.
        portal_view = await client.get("/portal/meetings", headers=auth_headers(contact_user))
        assert next(m for m in portal_view.json() if m["id"] == meeting_id)["status"] == "cancelled"

        already = await client.post(f"{staff_base}/meetings/{meeting_id}/cancel", headers=auth_headers(owner))
        assert already.status_code == 409

    async def test_cross_client_isolation_on_portal_cancel(self, client, team, db_session) -> None:
        agency, agency_client, owner, _member, _contact = team
        other_client = await make_client(db_session, agency=agency, name="Initech")
        other_contact = await make_user(db_session, full_name="Other Contact")
        await make_client_contact(db_session, agency=agency, client=other_client, user=other_contact)

        created = await client.post(
            f"/agencies/{agency.id}/meetings",
            json={"client_id": str(agency_client.id), "starts_at": _FAR_FUTURE_ISO, "title": "Globex only"},
            headers=auth_headers(owner),
        )
        meeting_id = created.json()["id"]

        # A contact from a DIFFERENT client can't see or cancel it.
        blocked = await client.get("/portal/meetings", headers=auth_headers(other_contact))
        assert all(m["id"] != meeting_id for m in blocked.json())

        forbidden = await client.post(f"/portal/meetings/{meeting_id}/cancel", headers=auth_headers(other_contact))
        assert forbidden.status_code == 404

    async def test_non_member_gets_404(self, client, team, db_session) -> None:
        agency, _agency_client, _owner, _member, _contact = team
        outsider = await make_user(db_session)
        resp = await client.get(f"/agencies/{agency.id}/meetings", headers=auth_headers(outsider))
        assert resp.status_code == 404

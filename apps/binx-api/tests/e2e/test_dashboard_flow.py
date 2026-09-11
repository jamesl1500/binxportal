"""End-to-end tests for the dashboard Overview aggregate —
``GET /agencies/{agency_id}/dashboard``: a member gets the composed shape in
one call, and the usual agency-membership gate applies."""

from __future__ import annotations

import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.e2e


class TestDashboardOverview:
    async def test_member_sees_the_composed_shape(self, client, user) -> None:
        headers = auth_headers(user)
        agency_id = (await client.post("/agencies", json={"name": "Rollup Co"}, headers=headers)).json()["id"]
        await client.post(f"/agencies/{agency_id}/clients", json={"name": "Acme"}, headers=headers)

        resp = await client.get(f"/agencies/{agency_id}/dashboard", headers=headers)
        assert resp.status_code == 200
        body = resp.json()

        assert body.keys() >= {
            "projects_total",
            "projects_active",
            "on_hold_projects",
            "clients_total",
            "clients_active",
            "invoice_summary",
            "overdue_invoices",
            "unread_messages",
            "my_work",
            "recent_activity",
        }
        assert body["clients_total"] == 1
        assert body["projects_total"] == 0
        assert body["my_work"]["tasks"] == []
        # Creating the agency + the client both log activity, so the rollup
        # isn't empty.
        assert len(body["recent_activity"]) >= 1

    async def test_non_member_gets_404(self, client, user, other_user) -> None:
        agency_id = (await client.post("/agencies", json={"name": "Private Co"}, headers=auth_headers(user))).json()[
            "id"
        ]

        resp = await client.get(f"/agencies/{agency_id}/dashboard", headers=auth_headers(other_user))
        assert resp.status_code == 404

    async def test_requires_authentication(self, client, user) -> None:
        agency_id = (await client.post("/agencies", json={"name": "Anon Co"}, headers=auth_headers(user))).json()["id"]

        resp = await client.get(f"/agencies/{agency_id}/dashboard")
        assert resp.status_code == 401

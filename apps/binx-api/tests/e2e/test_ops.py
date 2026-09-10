"""
End-to-end tests for the ops probes — the endpoints a load balancer or
Kubernetes liveness/readiness check would hit.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.e2e


async def test_health_is_always_ok(client) -> None:
    response = await client.get("/ops/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_ready_reports_ok_when_the_database_is_reachable(client) -> None:
    response = await client.get("/ops/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_files_module_health(client) -> None:
    response = await client.get("/files/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

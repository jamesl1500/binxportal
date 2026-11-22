"""End-to-end tests for the error library (core/errors.py +
core/error_handling.py): the response shape, request ids, what gets reported,
and what lands in the admin error log."""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator

import pytest
import sentry_sdk
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from binx_api.core import errors as core_errors
from binx_api.core.database import get_db
from binx_api.core.dependencies import CurrentUser
from binx_api.core.errors import Conflict, NotFound, UpstreamError, capture_error
from binx_api.modules.errors.models import STATUS_RESOLVED, STATUS_UNRESOLVED, ErrorEvent, ErrorIssue
from tests.conftest import auth_headers

pytestmark = pytest.mark.e2e


class Boom(RuntimeError):
    pass


@pytest.fixture
async def boom_app(db_session):
    """The real app plus a few routes that fail on purpose."""
    from binx_api.main import create_app

    app = create_app()

    @app.get("/test/crash")
    async def crash() -> dict:
        raise Boom("kaboom 42")

    @app.get("/test/agencies/{agency_id}/crash")
    async def agency_crash(agency_id: uuid.UUID, user: CurrentUser) -> dict:
        raise Boom("agency kaboom")

    @app.get("/test/not-found")
    async def not_found() -> dict:
        raise NotFound("Widget not found")

    @app.get("/test/conflict")
    async def conflict() -> dict:
        raise Conflict("Already there", code="already_there", details={"field": "name"})

    @app.get("/test/upstream")
    async def upstream() -> dict:
        try:
            raise TimeoutError("stripe timed out")
        except TimeoutError as exc:
            raise UpstreamError("Stripe didn't answer", service="stripe") from exc

    @app.get("/test/http-503")
    async def http_503() -> dict:
        raise HTTPException(503, "Stripe isn't configured")

    @app.get("/test/swallowed")
    async def swallowed() -> dict:
        try:
            raise Boom("best effort failed")
        except Boom as exc:
            captured = await capture_error(exc, level="warning", context={"step": "cleanup"})
        return {"reference": captured.reference}

    async def _override_get_db() -> AsyncGenerator:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    return app


@pytest.fixture
async def boom(boom_app) -> AsyncGenerator[AsyncClient]:
    # raise_app_exceptions=False: see the 500 response the way a browser
    # would, instead of the re-raised exception.
    transport = ASGITransport(app=boom_app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


@pytest.fixture
def sentry_calls(monkeypatch: pytest.MonkeyPatch) -> list[BaseException]:
    """Stands in for Sentry: records what would be sent and hands back a
    fake event id, as the real SDK does when it's initialised."""
    calls: list[BaseException] = []

    def _capture(exc, *args, **kwargs):
        calls.append(exc)
        return f"sentry{len(calls):026d}"

    monkeypatch.setattr(sentry_sdk, "capture_exception", _capture)
    monkeypatch.setattr(core_errors.sentry_sdk, "capture_exception", _capture)
    return calls


async def _events(db) -> list[ErrorEvent]:
    return list((await db.execute(select(ErrorEvent).order_by(ErrorEvent.created_at))).scalars().all())


class TestResponseShape:
    async def test_http_exception_keeps_detail_and_gains_code_and_request_id(self, client) -> None:
        res = await client.get("/no-such-endpoint")
        assert res.status_code == 404
        body = res.json()
        assert body["detail"] == "Not Found"
        assert body["code"] == "not_found"
        assert body["request_id"] == res.headers["x-request-id"]
        assert "reference" not in body

    async def test_unauthenticated(self, client) -> None:
        res = await client.get("/admin/errors/summary")
        assert res.status_code == 401
        assert res.json()["code"] == "unauthorized"
        assert res.headers["www-authenticate"] == "Bearer"

    async def test_validation_error_keeps_the_list(self, client) -> None:
        res = await client.post("/auth/login", json={"email": "nope"})
        assert res.status_code == 422
        body = res.json()
        assert body["code"] == "validation_error"
        assert isinstance(body["detail"], list) and body["detail"][0]["msg"]

    async def test_a_sane_incoming_request_id_is_echoed(self, client) -> None:
        res = await client.get("/ops/health", headers={"X-Request-ID": "trace-abc-12345"})
        assert res.headers["x-request-id"] == "trace-abc-12345"

    async def test_a_junk_request_id_is_replaced(self, client) -> None:
        res = await client.get("/ops/health", headers={"X-Request-ID": "<script>"})
        assert res.headers["x-request-id"] != "<script>"
        assert len(res.headers["x-request-id"]) == 32

    async def test_app_errors(self, boom, db_session, sentry_calls) -> None:
        res = await boom.get("/test/not-found")
        assert res.status_code == 404
        assert res.json()["code"] == "not_found"
        assert res.json()["detail"] == "Widget not found"

        res = await boom.get("/test/conflict")
        assert res.status_code == 409
        assert res.json()["code"] == "already_there"
        assert res.json()["details"] == {"field": "name"}

        # Expected errors are the API working: nothing reported.
        assert sentry_calls == []
        assert await _events(db_session) == []


class TestUnexpectedErrors:
    async def test_crash_is_a_500_with_a_reference_and_is_recorded(self, boom, db_session, sentry_calls) -> None:
        res = await boom.get("/test/crash", headers={"X-Request-ID": "req-crash-0001"})

        assert res.status_code == 500
        body = res.json()
        assert body["code"] == "internal_error"
        assert body["detail"] == "Something went wrong on our end."  # never the exception text
        assert "kaboom" not in res.text
        assert len(body["reference"]) == 8
        assert res.headers["x-request-id"] == "req-crash-0001"

        [event] = await _events(db_session)
        assert event.reference == body["reference"]
        assert event.error_type == "Boom"
        assert event.message == "kaboom 42"
        assert event.request_id == "req-crash-0001"
        assert event.route == "/test/crash"
        assert event.method == "GET"
        assert event.status_code == 500
        assert event.source == "api"
        assert "raise Boom" in (event.stacktrace or "")
        assert event.sentry_event_id == "sentry" + "1".zfill(26)
        assert len(sentry_calls) == 1

        issue = await db_session.get(ErrorIssue, event.issue_id)
        assert issue.status == STATUS_UNRESOLVED
        assert issue.event_count == 1
        assert issue.title == "kaboom 42"

    async def test_the_user_and_agency_are_attached(self, boom, db_session, user, sentry_calls) -> None:
        agency_id = uuid.uuid4()
        res = await boom.get(f"/test/agencies/{agency_id}/crash", headers=auth_headers(user))
        assert res.status_code == 500

        [event] = await _events(db_session)
        assert event.user_id == user.id
        assert event.agency_id == agency_id
        assert event.route == "/test/agencies/{agency_id}/crash"

    async def test_repeats_group_into_one_issue_and_a_resolved_issue_regresses(
        self, boom, db_session, sentry_calls
    ) -> None:
        await boom.get("/test/crash")
        await boom.get("/test/crash")
        issues = (await db_session.execute(select(ErrorIssue))).scalars().all()
        assert len(issues) == 1
        assert issues[0].event_count == 2

        issues[0].status = STATUS_RESOLVED
        await db_session.commit()

        await boom.get("/test/crash")
        await db_session.refresh(issues[0])
        assert issues[0].status == STATUS_UNRESOLVED
        assert issues[0].regressed_at is not None
        assert issues[0].event_count == 3

    async def test_upstream_error_is_reported_with_its_cause(self, boom, db_session, sentry_calls) -> None:
        res = await boom.get("/test/upstream")
        assert res.status_code == 502
        body = res.json()
        assert body["code"] == "upstream_error"
        assert body["detail"] == "Stripe didn't answer"
        assert body["reference"]

        [event] = await _events(db_session)
        assert event.error_type == "UpstreamError"
        assert "stripe timed out" in (event.stacktrace or "")  # the chained cause

    async def test_a_5xx_http_exception_is_reported_but_keeps_its_message(self, boom, db_session, sentry_calls) -> None:
        res = await boom.get("/test/http-503")
        assert res.status_code == 503
        assert res.json()["detail"] == "Stripe isn't configured"
        assert res.json()["code"] == "service_unavailable"
        [event] = await _events(db_session)
        assert event.message == "Stripe isn't configured"
        assert event.status_code == 503

    async def test_a_caught_error_can_still_be_captured(self, boom, db_session, sentry_calls) -> None:
        res = await boom.get("/test/swallowed")
        assert res.status_code == 200

        [event] = await _events(db_session)
        assert event.reference == res.json()["reference"]
        assert event.level == "warning"
        assert event.context == {"step": "cleanup"}
        assert event.path == "/test/swallowed"
        assert event.request_id

    async def test_a_broken_error_log_never_breaks_the_response(
        self, boom, db_session, sentry_calls, monkeypatch
    ) -> None:
        from binx_api.modules.errors import store

        def _broken():
            raise ConnectionError("database is down")

        monkeypatch.setattr(store, "session_factory", _broken)
        res = await boom.get("/test/crash")
        assert res.status_code == 500
        assert res.json()["reference"]
        assert len(sentry_calls) == 1  # Sentry still has it
        assert await db_session.scalar(select(func.count()).select_from(ErrorEvent)) == 0

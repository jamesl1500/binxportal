"""
Unit tests for ``binx_api.core.email``.

The default backend just logs, so these tests check two things:
the ``send_*_email`` helpers build the right frontend link (correct path +
the token as a query parameter), and they all funnel through ``send_email``
(which is what the ``email_outbox`` fixture patches everywhere else).
"""

from __future__ import annotations

import logging

import pytest

from binx_api.core import email
from binx_api.core.config import get_settings

pytestmark = pytest.mark.unit

settings = get_settings()


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    calls: list[dict] = []
    monkeypatch.setattr(email, "send_email", lambda **kw: calls.append(kw))
    return calls


def test_send_email_default_backend_logs(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="binx_api.email"):
        email.send_email(to="x@example.com", subject="Hi", body="Body text")
    assert "x@example.com" in caplog.text
    assert "Body text" in caplog.text


def test_verification_email_links_to_the_verify_page(captured: list[dict]) -> None:
    email.send_verification_email(to="new@example.com", token="tok-abc")
    (call,) = captured
    assert call["to"] == "new@example.com"
    assert call["body"].endswith(f"{settings.frontend_url}/auth/verify-email?token=tok-abc")


def test_password_reset_email_links_to_the_reset_page(captured: list[dict]) -> None:
    email.send_password_reset_email(to="user@example.com", token="tok-reset")
    (call,) = captured
    assert f"{settings.frontend_url}/auth/reset-password?token=tok-reset" in call["body"]


def test_email_change_email_goes_to_the_new_address(captured: list[dict]) -> None:
    email.send_email_change_email(to="brand-new@example.com", token="tok-change")
    (call,) = captured
    assert call["to"] == "brand-new@example.com"
    assert f"{settings.frontend_url}/auth/confirm-email?token=tok-change" in call["body"]


def test_agency_invitation_email_names_the_agency_and_inviter(captured: list[dict]) -> None:
    email.send_agency_invitation_email(
        to="invitee@example.com", agency_name="Acme", inviter_name="Dana Dev", token="tok-invite"
    )
    (call,) = captured
    assert "Acme" in call["subject"]
    assert "Dana Dev" in call["subject"]
    assert f"{settings.frontend_url}/auth/accept-invite?token=tok-invite" in call["body"]

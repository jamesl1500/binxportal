"""
Unit tests for ``binx_api.core.email``.

The default (``ses_from_email`` unset) backend just logs, so most of these
tests check two things: the ``send_*_email`` helpers build the right
frontend link (correct path + the token as a query parameter), and they all
funnel through ``send_email`` (which is what the ``email_outbox`` fixture
patches everywhere else). A separate group covers ``send_email`` itself —
the real SES path, mocked, and its fail-soft behavior on a delivery error.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from binx_api.core import email
from binx_api.core.config import get_settings

pytestmark = pytest.mark.unit

settings = get_settings()


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    calls: list[dict] = []

    async def _capture(**kw):
        calls.append(kw)

    monkeypatch.setattr(email, "send_email", _capture)
    return calls


async def test_send_email_default_backend_logs(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.INFO, logger="binx_api.email"):
        await email.send_email(to="x@example.com", subject="Hi", body="Body text")
    assert "x@example.com" in caplog.text
    assert "Body text" in caplog.text


async def test_verification_email_links_to_the_verify_page(captured: list[dict]) -> None:
    await email.send_verification_email(to="new@example.com", token="tok-abc")
    (call,) = captured
    assert call["to"] == "new@example.com"
    assert call["body"].endswith(f"{settings.frontend_url}/auth/verify-email?token=tok-abc")


async def test_password_reset_email_links_to_the_reset_page(captured: list[dict]) -> None:
    await email.send_password_reset_email(to="user@example.com", token="tok-reset")
    (call,) = captured
    assert f"{settings.frontend_url}/auth/reset-password?token=tok-reset" in call["body"]


async def test_email_change_email_goes_to_the_new_address(captured: list[dict]) -> None:
    await email.send_email_change_email(to="brand-new@example.com", token="tok-change")
    (call,) = captured
    assert call["to"] == "brand-new@example.com"
    assert f"{settings.frontend_url}/auth/confirm-email?token=tok-change" in call["body"]


async def test_agency_invitation_email_names_the_agency_and_inviter(captured: list[dict]) -> None:
    await email.send_agency_invitation_email(
        to="invitee@example.com", agency_name="Acme", inviter_name="Dana Dev", token="tok-invite"
    )
    (call,) = captured
    assert "Acme" in call["subject"]
    assert "Dana Dev" in call["subject"]
    assert f"{settings.frontend_url}/auth/accept-invite?token=tok-invite" in call["body"]


class TestSendEmail:
    """``send_email`` itself — the real SES path (mocked) and its fail-soft
    behavior. Every test here monkeypatches ``_get_ses_client`` directly, so
    the module-level client cache is never actually touched."""

    async def test_unset_from_email_never_touches_ses(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(email.settings, "ses_from_email", None)
        client_factory = MagicMock()
        monkeypatch.setattr(email, "_get_ses_client", client_factory)

        await email.send_email(to="x@example.com", subject="Hi", body="Body")

        client_factory.assert_not_called()

    async def test_configured_from_email_calls_ses_with_the_right_shape(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(email.settings, "ses_from_email", "Binx <noreply@mail.binxportal.com>")
        fake_client = SimpleNamespace(send_email=MagicMock())
        monkeypatch.setattr(email, "_get_ses_client", lambda: fake_client)

        await email.send_email(to="x@example.com", subject="Hi", body="Body text")

        fake_client.send_email.assert_called_once_with(
            Source="Binx <noreply@mail.binxportal.com>",
            Destination={"ToAddresses": ["x@example.com"]},
            Message={
                "Subject": {"Data": "Hi", "Charset": "UTF-8"},
                "Body": {"Text": {"Data": "Body text", "Charset": "UTF-8"}},
            },
        )

    async def test_a_delivery_error_is_logged_not_raised(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        monkeypatch.setattr(email.settings, "ses_from_email", "Binx <noreply@mail.binxportal.com>")
        error = ClientError({"Error": {"Code": "Throttling", "Message": "Rate exceeded"}}, "SendEmail")
        fake_client = SimpleNamespace(send_email=MagicMock(side_effect=error))
        monkeypatch.setattr(email, "_get_ses_client", lambda: fake_client)

        with caplog.at_level(logging.ERROR, logger="binx_api.email"):
            await email.send_email(to="x@example.com", subject="Hi", body="Body")  # must not raise

        assert "Failed to send email" in caplog.text

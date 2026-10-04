"""
Unit tests for ``binx_api.core.config.Settings``.

``get_settings`` is ``lru_cache``d, so these build ``Settings`` directly to
avoid poking at global state the rest of the suite depends on.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from binx_api.core.config import Settings, get_settings

pytestmark = pytest.mark.unit


def test_get_settings_is_cached() -> None:
    assert get_settings() is get_settings()


def test_defaults_are_present_when_no_env() -> None:
    # _env_file=None -> ignore any .env on disk, exercise the field defaults.
    s = Settings(_env_file=None)
    assert s.jwt_algorithm == "HS256"
    assert s.access_token_expire_minutes == 30
    assert s.project_upload_max_bytes == 25 * 1024 * 1024
    assert s.database_url.startswith("postgresql+asyncpg://")


def test_env_vars_override_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "from-the-environment")
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "5")
    s = Settings(_env_file=None)
    assert s.jwt_secret == "from-the-environment"
    assert s.access_token_expire_minutes == 5


def test_unknown_env_vars_are_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TOTALLY_UNRELATED_SETTING", "whatever")
    Settings(_env_file=None)  # extra="ignore" -> no ValidationError


@pytest.mark.parametrize("value", ["-0.1", "1.1", "2"])
def test_sentry_traces_sample_rate_rejects_out_of_range(value: str, monkeypatch: pytest.MonkeyPatch) -> None:
    # The Sentry SDK silently drops traces for a rate outside 0.0-1.0 rather
    # than erroring, so this is caught here instead.
    monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", value)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)

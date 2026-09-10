"""
Unit tests for ``binx_api.core.security`` — password hashing and the two
kinds of token the app issues (signed JWT access tokens, and opaque
random tokens for email links / refresh).

No database, no app — pure functions.
"""

from __future__ import annotations

import time
from datetime import timedelta

import pytest
from jose import jwt

from binx_api.core import security
from binx_api.core.config import get_settings

pytestmark = pytest.mark.unit

settings = get_settings()


class TestPasswordHashing:
    def test_hash_is_not_the_plaintext(self) -> None:
        hashed = security.hash_password("hunter2-hunter2")
        assert hashed != "hunter2-hunter2"
        assert hashed.startswith("$2")  # bcrypt marker

    def test_verify_accepts_the_right_password(self) -> None:
        hashed = security.hash_password("hunter2-hunter2")
        assert security.verify_password("hunter2-hunter2", hashed) is True

    def test_verify_rejects_the_wrong_password(self) -> None:
        hashed = security.hash_password("hunter2-hunter2")
        assert security.verify_password("not the password", hashed) is False

    def test_same_password_hashes_differently_each_time(self) -> None:
        # bcrypt salts per call — two hashes of the same input must differ,
        # and both must still verify.
        a = security.hash_password("same-input-here")
        b = security.hash_password("same-input-here")
        assert a != b
        assert security.verify_password("same-input-here", a)
        assert security.verify_password("same-input-here", b)


class TestAccessTokens:
    def test_round_trips_the_subject_and_extra_claims(self) -> None:
        token = security.create_access_token("user-123", {"type": "access", "role": "admin"})
        payload = security.decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["type"] == "access"
        assert payload["role"] == "admin"

    def test_sets_an_expiry_in_the_future(self) -> None:
        token = security.create_access_token("user-123")
        payload = security.decode_access_token(token)
        assert payload is not None
        assert payload["exp"] > time.time()

    def test_rejects_a_token_signed_with_a_different_secret(self) -> None:
        forged = jwt.encode(
            {"sub": "user-123", "exp": time.time() + 3600},
            "not-the-real-secret",
            algorithm=settings.jwt_algorithm,
        )
        assert security.decode_access_token(forged) is None

    def test_rejects_a_garbage_string(self) -> None:
        assert security.decode_access_token("not.a.jwt") is None

    def test_rejects_an_expired_token(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Force the "expires in the past" case without sleeping.
        monkeypatch.setattr(security.settings, "access_token_expire_minutes", -1)
        token = security.create_access_token("user-123")
        assert security.decode_access_token(token) is None

    def test_expiry_window_follows_the_configured_minutes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(security.settings, "access_token_expire_minutes", 5)
        token = security.create_access_token("user-123")
        payload = security.decode_access_token(token)
        assert payload is not None
        # ~5 minutes out, allow a little slack for execution time.
        assert (
            timedelta(minutes=4).total_seconds() < payload["exp"] - time.time() <= timedelta(minutes=5).total_seconds()
        )


class TestOpaqueTokens:
    def test_opaque_tokens_are_unique_and_url_safe(self) -> None:
        tokens = {security.generate_opaque_token() for _ in range(200)}
        assert len(tokens) == 200
        assert all(set(t) <= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-") for t in tokens)

    def test_hash_token_is_deterministic_and_hides_the_input(self) -> None:
        raw = security.generate_opaque_token()
        assert security.hash_token(raw) == security.hash_token(raw)
        assert security.hash_token(raw) != raw
        assert len(security.hash_token(raw)) == 64  # sha256 hex digest

    def test_different_tokens_hash_differently(self) -> None:
        assert security.hash_token("a") != security.hash_token("b")

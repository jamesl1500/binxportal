"""Unit tests for the error library's pure parts: classification,
fingerprinting and Sentry's before_send filter."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from binx_api.core.error_handling import _before_send
from binx_api.core.errors import (
    BadRequest,
    NotFound,
    ServiceUnavailable,
    UpstreamError,
    code_for_status,
    is_reportable,
    new_reference,
)
from binx_api.modules.errors.store import fingerprint_exception, fingerprint_web, normalize_message, python_culprit

pytestmark = pytest.mark.unit


class TestClassification:
    @pytest.mark.parametrize(
        ("exc", "expected"),
        [
            (NotFound(), False),
            (BadRequest("nope"), False),
            (HTTPException(404, "missing"), False),
            (HTTPException(402, "upgrade"), False),
            (HTTPException(502, "upstream"), True),
            (UpstreamError(service="stripe"), True),
            (ServiceUnavailable(), True),
            (KeyError("plan"), True),
        ],
    )
    def test_is_reportable(self, exc, expected) -> None:
        assert is_reportable(exc) is expected

    def test_codes(self) -> None:
        assert code_for_status(404) == "not_found"
        assert code_for_status(418) == "error"
        assert code_for_status(599) == "internal_error"

    def test_app_error_overrides(self) -> None:
        err = NotFound("Invoice not found", code="invoice_not_found", details={"id": "x"})
        assert (err.status_code, err.code, err.message, err.details) == (
            404,
            "invoice_not_found",
            "Invoice not found",
            {"id": "x"},
        )
        assert NotFound().message == "Not found."
        assert UpstreamError(service="ses").service == "ses"

    def test_reference_is_short_and_readable(self) -> None:
        event_id = uuid.UUID("7f3a9c21-0000-4000-8000-000000000000")
        assert new_reference(event_id) == "7F3A9C21"


class TestFingerprinting:
    def test_normalize_strips_variable_parts(self) -> None:
        a = normalize_message(f"Project {uuid.uuid4()} not found for 'alice@example.com' after 3 tries")
        b = normalize_message(f"Project {uuid.uuid4()} not found for 'bob@example.com' after 12 tries")
        assert a == b
        assert "<uuid>" in a and "<n>" in a

    def test_python_culprit_is_the_deepest_binx_api_frame(self) -> None:
        def raise_it():
            raise ValueError("bad")

        try:
            raise_it()
        except ValueError as exc:
            # This test file isn't under binx_api/, so there's no frame of
            # ours to blame.
            assert python_culprit(exc) is None

        # A function "defined" in one of our modules, the way a real
        # traceback would show it.
        source = "def explode():\n    raise ValueError('bad')\n"
        namespace: dict = {}
        exec(compile(source, "/srv/app/src/binx_api/modules/fake/service.py", "exec"), namespace)  # noqa: S102
        with pytest.raises(ValueError) as caught:
            namespace["explode"]()
        assert python_culprit(caught.value) == "binx_api.modules.fake.service in explode"

    def test_same_type_and_place_is_the_same_issue(self) -> None:
        here = "binx_api.modules.x in f"
        assert fingerprint_exception("KeyError", here, "a") == fingerprint_exception("KeyError", here, "b")
        assert fingerprint_exception("KeyError", here, "a") != fingerprint_exception("ValueError", here, "a")
        # With no culprit, the normalized message decides.
        assert fingerprint_exception("E", None, "id 1") == fingerprint_exception("E", None, "id 2")
        assert fingerprint_exception("E", None, "boom") != fingerprint_exception("E", None, "bang")
        assert fingerprint_web("TypeError", "x 1") != fingerprint_exception("TypeError", None, "x 1")


class TestBeforeSend:
    def _hint(self, exc: BaseException) -> dict:
        return {"exc_info": (type(exc), exc, None)}

    def test_drops_expected_errors(self) -> None:
        assert _before_send({}, self._hint(NotFound())) is None
        assert _before_send({}, self._hint(HTTPException(403))) is None

    def test_keeps_real_ones(self) -> None:
        event = {"message": "x"}
        assert _before_send(event, self._hint(KeyError("x"))) is event
        assert _before_send(event, self._hint(HTTPException(503))) is event
        assert _before_send(event, {}) is event
